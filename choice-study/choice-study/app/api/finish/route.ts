import { NextResponse } from "next/server";
import { articles } from "@/content/articles";
import { addLog, onceList, saveParticipant } from "@/lib/store";
import { cookieOptions, FIN_COOKIE, finValue, handle, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// 3記事すべてにコメントした人だけ終了 → 完了コードを返す
export const POST = handle(async () => {
  const { p, fin } = await readSession();
  if (!p) {
    if (fin) return NextResponse.json({ code: fin.code });
    return NextResponse.json({ error: "最初のページからやり直してください" }, { status: 400 });
  }
  if (!p.done) {
    const once = await onceList(p.pid);
    if (!articles.every((a) => once.includes(`comment:${a.id}`))) {
      return NextResponse.json({ error: "まだコメントしていない記事があります" }, { status: 409 });
    }
    p.done = true;
    p.doneAt = new Date().toISOString();
    await saveParticipant(p);
    await addLog({ at: p.doneAt, pid: p.pid, code: p.code, group: p.group, type: "finish" });
  }
  const res = NextResponse.json({ code: p.code });
  res.cookies.set(FIN_COOKIE, finValue(p.pid, p.code), cookieOptions());
  return res;
});
