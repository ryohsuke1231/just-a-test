import { NextResponse } from "next/server";
import { addTrial, saveParticipant } from "@/lib/store";
import { clientView, currentParticipant } from "@/lib/view";

export const dynamic = "force-dynamic";

// 1問分の回答。順番どおりにしか受け付けない（戻る・やり直しは不可）
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const p = await currentParticipant();
  if (!p) return NextResponse.json({ error: "最初のページからやり直してください" }, { status: 400 });
  if (p.done) return NextResponse.json(clientView(p));
  // 二重送信など、番号がずれているときは今の状態を返すだけ
  if (body.index !== p.answered) return NextResponse.json(clientView(p));
  if (body.side !== "left" && body.side !== "right") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const t = p.trials[p.answered];
  const right = t.left === "a" ? "b" : "a";
  const rt = Number.isFinite(body.rtMs) ? Math.max(0, Math.min(600000, Math.round(body.rtMs))) : -1;
  const now = new Date().toISOString();

  await addTrial({ at: now, pid: p.pid, code: p.code, cond: p.cond, index: p.answered, pair: t.pair, left: t.left, chosen: body.side === "left" ? t.left : right, rtMs: rt });

  p.answered += 1;
  if (p.answered >= p.trials.length) {
    p.done = true;
    p.doneAt = now;
  }
  await saveParticipant(p);
  return NextResponse.json(clientView(p));
}
