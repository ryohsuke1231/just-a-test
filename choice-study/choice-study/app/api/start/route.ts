import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assignGroup, codeTaken, saveParticipant, type Participant } from "@/lib/store";
import { cookieOptions, handle, newCode, newHandle, noStore, PID_COOKIE, readSession, viewOf } from "@/lib/session";

export const dynamic = "force-dynamic";

// 開始。すでに参加していればその状態を返すだけ（やり直し不可）
export const POST = handle(async () => {
  const { p: existing, fin } = await readSession();
  if (existing || fin) return NextResponse.json(await viewOf(existing, fin), { headers: noStore });

  let code = newCode();
  for (let i = 0; i < 10 && (await codeTaken(code)); i++) code = newCode();

  const p: Participant = {
    pid: randomUUID(),
    group: await assignGroup(),
    handle: newHandle(),
    code,
    createdAt: new Date().toISOString(),
    done: false,
  };
  await saveParticipant(p);

  const res = NextResponse.json(await viewOf(p, null), { headers: noStore });
  res.cookies.set(PID_COOKIE, p.pid, cookieOptions());
  return res;
});
