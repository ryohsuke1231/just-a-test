import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assignCond, codeTaken, saveParticipant, type Participant } from "@/lib/store";
import { clientView, COOKIE, currentParticipant, newCode, shuffledTrials } from "@/lib/view";

export const dynamic = "force-dynamic";

// 開始。すでにcookieのIDがあれば、その続き（やり直し不可）
export async function POST() {
  const existing = await currentParticipant();
  if (existing) return NextResponse.json(clientView(existing));

  let code = newCode();
  for (let i = 0; i < 10 && (await codeTaken(code)); i++) code = newCode();

  const p: Participant = {
    pid: randomUUID(),
    cond: await assignCond(),
    code,
    createdAt: new Date().toISOString(),
    trials: shuffledTrials(),
    answered: 0,
    done: false,
  };
  await saveParticipant(p);

  const res = NextResponse.json(clientView(p));
  res.cookies.set(COOKIE, p.pid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
