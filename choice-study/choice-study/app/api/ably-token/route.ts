import { NextResponse } from "next/server";
import { Rest } from "ably";
import { randomUUID } from "crypto";
import { currentParticipant } from "@/lib/view";

export const dynamic = "force-dynamic";

// Pongのオンライン対戦用に、期限つきの許可（トークン）を発行する。
// APIキーそのものは環境変数 ABLY_API_KEY に置き、ブラウザには渡さない。
export async function GET() {
  const key = process.env.ABLY_API_KEY;
  if (!key) return NextResponse.json({ error: "online play is not configured" }, { status: 503 });

  // 回答を終えた人だけ
  const p = await currentParticipant();
  if (!p?.done) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rest = new Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: "p-" + randomUUID().slice(0, 12), // 参加IDとは無関係の使い捨てID
    capability: JSON.stringify({ "pong:*": ["publish", "subscribe"] }), // pong: で始まるチャンネルだけ
    ttl: 60 * 60 * 1000,
  });
  return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
}
