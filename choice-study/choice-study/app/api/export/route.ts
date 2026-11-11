import { articles, type Slot } from "@/content/articles";
import { allLogs, allParticipants, usingRedis, type LogRow } from "@/lib/store";
import { handle } from "@/lib/session";

export const dynamic = "force-dynamic";

// 研究者用のデータ書き出し
//   /api/export?key=管理キー&type=summary … 1人1行（フォームと完了コードでつなぐ用）
//   /api/export?key=管理キー&type=logs    … すべての操作の記録
export const GET = handle(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const key = process.env.ADMIN_KEY;
  if (!key || key.length < 12 || searchParams.get("key") !== key) return new Response("Not found", { status: 404 });

  const logs = await allLogs();
  const groupName = { A: "A群", B: "B群" } as const;

  if (searchParams.get("type") === "logs") {
    const header = ["日時", "完了コード", "群", "種類", "記事", "対象", "対象の種類", "本文", "返信のすすめへの反応", "滞在ミリ秒"];
    const rows = logs.map((l) => [l.at, l.code, groupName[l.group], l.type, l.article, l.target, l.target ? kindOf(l.target) : "", l.text, l.result, l.dwellMs]);
    return csv("logs.csv", [header, ...rows]);
  }

  const people = (await allParticipants()).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const header = [
    "完了コード", "群", "開始日時", "完了",
    ...articles.flatMap((a) => [
      `${a.id}_コメント`, `${a.id}_滞在秒`,
      `${a.id}_いいね_多数派`, `${a.id}_いいね_少数派`, `${a.id}_いいね_長文`, `${a.id}_いいね_短文`, `${a.id}_いいね_中立`,
      `${a.id}_いいねした枠`, `${a.id}_返信数`, `${a.id}_返信`, `${a.id}_返信のすすめ`,
    ]),
  ];
  const rows = people.map((p) => {
    const mine = logs.filter((l) => l.pid === p.pid);
    const cols = articles.flatMap((a) => {
      const inA = mine.filter((l) => l.article === a.id);
      const comment = inA.find((l) => l.type === "comment");
      const leave = inA.find((l) => l.type === "leave");
      const liked = finalLikes(inA);
      const count = (k: string) => [...liked].filter((t) => kindOf(t) === k).length;
      const replies = inA.filter((l) => l.type === "reply");
      const nudge = inA.find((l) => l.type === "nudge");
      const dwellMs = leave?.dwellMs ?? comment?.dwellMs;
      return [
        comment?.text ?? "", dwellMs != null ? Math.round(dwellMs / 1000) : "",
        count("多数派"), count("少数派"), count("長文"), count("短文"), count("中立"),
        [...liked].join(" "), replies.length, replies.map((r) => `${r.target}: ${r.text}`).join(" / "),
        nudge ? (nudge.result === "back" ? "戻った" : "そのまま次へ") : "",
      ];
    });
    return [p.code, groupName[p.group], p.createdAt, p.done ? "はい" : "いいえ", ...cols];
  });
  return csv(usingRedis ? "summary.csv" : "summary-local.csv", [header, ...rows]);
});

// いいねは押した／取り消したを順に反映して、最後の状態を出す
function finalLikes(rows: LogRow[]) {
  const liked = new Set<string>();
  for (const l of rows) {
    if (l.type === "like" && l.target) liked.add(l.target);
    if (l.type === "unlike" && l.target) liked.delete(l.target);
  }
  return liked;
}

// コメント枠のIDから、その枠の種類（多数派・少数派など）を出す。もとからある返信は親と同じ
const KIND: Record<Slot["kind"], string> = { majority: "多数派", minority: "少数派", neutral: "中立", long: "長文", short: "短文" };
function kindOf(target: string) {
  const id = target.replace(/-reply$/, "");
  for (const a of articles) {
    const s = a.slots.find((x) => x.id === id);
    if (s) return KIND[s.kind];
  }
  return "";
}

function csv(name: string, rows: unknown[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // 先頭のBOMで、スプレッドシートでも日本語が文字化けしない
  const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
