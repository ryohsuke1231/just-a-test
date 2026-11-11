import { NextResponse } from "next/server";
import { handle, noStore, readSession, viewOf } from "@/lib/session";

export const dynamic = "force-dynamic";

// 今の状態（未開始／途中／終了）
export const GET = handle(async () => {
  const { p, fin } = await readSession();
  return NextResponse.json(await viewOf(p, fin), { headers: noStore });
});
