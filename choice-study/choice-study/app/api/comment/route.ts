import { NextResponse } from "next/server";
import { articles } from "@/content/articles";
import { addLog, claimOnce, onceList, releaseOnce } from "@/lib/store";
import { handle, readSession } from "@/lib/session";
import { checkText, dwell } from "@/lib/text";

export const dynamic = "force-dynamic";

// 記事へのコメント（各記事1回だけ・記事の順番どおり）
export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const { p } = await readSession();
  if (!p) return NextResponse.json({ error: "最初のページからやり直してください" }, { status: 400 });
  if (p.done) return NextResponse.json({ error: "すでに終了しています" }, { status: 409 });

  const index = articles.findIndex((a) => a.id === body.article);
  if (index < 0) return NextResponse.json({ error: "記事が見つかりません" }, { status: 400 });
  const checked = checkText(body.text);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (index > 0) {
    const once = await onceList(p.pid);
    if (!once.includes(`comment:${articles[index - 1].id}`)) return NextResponse.json({ error: "前の記事から順に進んでください" }, { status: 409 });
  }
  const key = `comment:${body.article}`;
  if (!(await claimOnce(p.pid, key))) return NextResponse.json({ error: "この記事にはもうコメントしています" }, { status: 409 });

  try {
    await addLog({ at: new Date().toISOString(), pid: p.pid, code: p.code, group: p.group, type: "comment", article: body.article, text: checked.text, dwellMs: dwell(body.dwellMs) });
  } catch (e) {
    await releaseOnce(p.pid, key); // 記録できなかったら、もう一度投稿できるように戻す
    throw e;
  }
  return NextResponse.json({ ok: true, text: checked.text });
});
