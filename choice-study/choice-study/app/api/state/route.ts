import { NextResponse } from "next/server";
import { pairs } from "@/content/pairs";
import { clientView, currentParticipant } from "@/lib/view";

export const dynamic = "force-dynamic";

// 今の状態（未開始／途中／終了）を返す
export async function GET() {
  const p = await currentParticipant();
  if (!p) return NextResponse.json({ started: false, done: false, total: pairs.length, current: null, preload: [], code: null });
  return NextResponse.json(clientView(p));
}
