import { pairs, TOO_FAST_MS, type Tier } from "@/content/pairs";
import { allParticipants, allTrials, usingRedis } from "@/lib/store";
import { highImage, pairById } from "@/lib/view";

export const dynamic = "force-dynamic";

// 研究者用のデータ書き出し
//   /api/export?key=管理キー&type=trials   … 1回の選択が1行（分析の中心）
//   /api/export?key=管理キー&type=summary  … 1人1行（フォームと完了コードでつなぐ用）
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = process.env.ADMIN_KEY;
  if (!key || key.length < 12 || searchParams.get("key") !== key) return new Response("Not found", { status: 404 });

  const trials = await allTrials();
  const condName = { none: "数字なし", X: "数字あり(X)", Y: "数字あり(Y)" } as const;
  const tierName: Record<Tier, string> = { even: "互角", mid: "中くらい", strong: "はっきり" };

  if ((searchParams.get("type") ?? "trials") === "trials") {
    const header = ["日時", "完了コード", "条件", "何問目", "組", "種類", "画像a", "画像b", "左の画像", "多い数字の画像", "選んだ画像", "多いほうを選んだ", "aを選んだ", "反応ミリ秒", "速すぎ"];
    const rows = trials.map((t) => {
      const pair = pairById(t.pair);
      const hi = highImage(pair, t.cond);
      return [
        t.at, t.code, condName[t.cond], t.index + 1, t.pair, tierName[pair.tier], pair.a, pair.b, t.left,
        hi ?? "", t.chosen, hi === null ? "" : t.chosen === hi ? 1 : 0, t.chosen === "a" ? 1 : 0,
        t.rtMs, t.rtMs >= 0 && t.rtMs < TOO_FAST_MS ? 1 : 0,
      ];
    });
    return csv("trials.csv", [header, ...rows]);
  }

  const people = (await allParticipants()).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const tiers: Tier[] = ["even", "mid", "strong"];
  const header = [
    "完了コード", "条件", "開始日時", "完了", "回答数",
    ...tiers.map((t) => `多いほうを選んだ割合_${tierName[t]}`),
    "反応時間の中央値ミリ秒", "速すぎた回答数",
    ...pairs.map((p) => `${p.id}_選んだ画像`),
  ];
  const rows = people.map((p) => {
    const mine = trials.filter((t) => t.pid === p.pid);
    const rate = (tier: Tier) => {
      if (p.cond === "none") return "";
      const list = mine.filter((t) => pairById(t.pair).tier === tier);
      if (list.length === 0) return "";
      const hit = list.filter((t) => t.chosen === highImage(pairById(t.pair), p.cond)).length;
      return (hit / list.length).toFixed(3);
    };
    const rts = mine.map((t) => t.rtMs).filter((x) => x >= 0).sort((a, b) => a - b);
    const median = rts.length ? rts[Math.floor(rts.length / 2)] : "";
    const fast = rts.filter((x) => x < TOO_FAST_MS).length;
    const chosen = pairs.map((pair) => mine.find((t) => t.pair === pair.id)?.chosen ?? "");
    return [p.code, condName[p.cond], p.createdAt, p.done ? "はい" : "いいえ", mine.length, ...tiers.map(rate), median, fast, ...chosen];
  });
  return csv(usingRedis ? "summary.csv" : "summary-local.csv", [header, ...rows]);
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
