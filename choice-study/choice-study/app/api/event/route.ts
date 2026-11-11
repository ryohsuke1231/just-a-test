import { NextResponse } from "next/server";
import { articles } from "@/content/articles";
import { addLog, claimOnce, releaseOnce } from "@/lib/store";
import { handle, readSession } from "@/lib/session";
import { checkText, dwell } from "@/lib/text";

export const dynamic = "force-dynamic";

const TYPES = ["like", "unlike", "reply", "leave", "nudge"] as const;
type T = (typeof TYPES)[number];

// いいね・返信・記事を離れたとき（滞在時間）・返信のすすめへの反応 の記録
export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const { p } = await readSession();
  if (!p || p.done) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const type = body.type as T;
  if (!TYPES.includes(type)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const article = articles.find((a) => a.id === body.article);
  if (!article) return NextResponse.json({ error: "invalid" }, { status: 400 });

  let target: string | undefined;
  if (type === "like" || type === "unlike" || type === "reply") {
    // いいね先はコメント枠のID、または「枠のID-reply」（もとからある返信）。返信できるのはコメント枠だけ
    const t = body.target;
    const ok = typeof t === "string" && article.slots.some((s) => s.id === t || (type !== "reply" && s.reply && `${s.id}-reply` === t));
    if (!ok) return NextResponse.json({ error: "invalid" }, { status: 400 });
    target = t;
  }

  let text: string | undefined;
  if (type === "reply") {
    const checked = checkText(body.text);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    text = checked.text;
    if (!(await claimOnce(p.pid, `reply:${target}`))) return NextResponse.json({ error: "このコメントにはもう返信しています" }, { status: 409 });
  }

  const result = type === "nudge" && (body.result === "back" || body.result === "skip") ? body.result : undefined;
  try {
    await addLog({ at: new Date().toISOString(), pid: p.pid, code: p.code, group: p.group, type, article: article.id, target, text, result, dwellMs: dwell(body.dwellMs) });
  } catch (e) {
    if (type === "reply") await releaseOnce(p.pid, `reply:${target}`);
    throw e;
  }
  return NextResponse.json({ ok: true, text });
});
