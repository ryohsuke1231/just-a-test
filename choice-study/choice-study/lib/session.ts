import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { articles, type Group } from "@/content/articles";
import { getParticipant, onceList, StoreNotReady, type Participant } from "@/lib/store";

export const PID_COOKIE = "pid";
// 回答を終えたことを示すcookie。改ざんできないよう署名を付ける。
// データベースの読み込みに失敗しても、これがあれば「回答済み」と判定できる
export const FIN_COOKIE = "fin";

const secret = () => process.env.ADMIN_KEY || "local-dev-secret";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url").slice(0, 32);

export function finValue(pid: string, code: string) {
  const v = `${pid}.${code}`;
  return `${v}.${sign(v)}`;
}

function readFin(raw: string | undefined): { pid: string; code: string } | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const v = raw.slice(0, i);
  const a = Buffer.from(raw.slice(i + 1));
  const b = Buffer.from(sign(v));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [pid, code] = v.split(".");
  return pid && code ? { pid, code } : null;
}

export async function readSession(): Promise<{ p: Participant | null; fin: { pid: string; code: string } | null }> {
  const jar = await cookies();
  const fin = readFin(jar.get(FIN_COOKIE)?.value);
  const p = await getParticipant(jar.get(PID_COOKIE)?.value ?? fin?.pid);
  return { p, fin };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  };
}

// 完了コード：見間違えやすい 0/O, 1/I/L, 2/Z, 5/S, 8/B を除く
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY34679";
export function newCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

const HANDLE_CHARS = "abcdefghijkmnopqrstuvwxyz23456789";
export function newHandle() {
  let s = "user_";
  for (let i = 0; i < 5; i++) s += HANDLE_CHARS[randomInt(HANDLE_CHARS.length)];
  return s;
}

// 画面に渡す記事。参加者の群の文だけを入れる（もう一方の群の文はブラウザに送らない）
function articlesFor(group: Group) {
  return articles.map((a) => ({
    id: a.id,
    category: a.category,
    title: a.title,
    fictional: !!a.fictional,
    body: a.body,
    sourceNote: a.sourceNote ?? null,
    comments: a.slots.map((s) => ({
      id: s.id,
      author: s.author,
      time: s.time,
      likes: s.likes,
      text: s[group],
      reply: s.reply ? { id: `${s.id}-reply`, author: s.reply.author, time: s.reply.time, likes: s.reply.likes, text: s.reply[group] } : null,
    })),
  }));
}

export type View =
  | { status: "new" }
  | { status: "active"; handle: string; posted: string[]; replied: string[]; articles: ReturnType<typeof articlesFor> }
  | { status: "done"; code: string };

export async function viewOf(p: Participant | null, fin: { code: string } | null): Promise<View> {
  if (p?.done) return { status: "done", code: p.code };
  if (fin) return { status: "done", code: fin.code };
  if (!p) return { status: "new" };
  const once = await onceList(p.pid);
  return {
    status: "active",
    handle: p.handle,
    posted: articles.map((a) => a.id).filter((id) => once.includes(`comment:${id}`)),
    replied: once.filter((k) => k.startsWith("reply:")).map((k) => k.slice(6)),
    articles: articlesFor(p.group),
  };
}

// エラーをまとめて扱う（データベース未接続は 503 で知らせる）
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof StoreNotReady) {
        return NextResponse.json({ error: "サーバーの準備ができていません。先生に伝えてください。（データベース未接続）" }, { status: 503 });
      }
      console.error(e);
      return NextResponse.json({ error: "サーバーでエラーが起きました。少し待ってからもう一度試してください" }, { status: 500 });
    }
  };
}

export const noStore = { "Cache-Control": "no-store" };
