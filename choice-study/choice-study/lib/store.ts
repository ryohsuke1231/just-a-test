import { Redis } from "@upstash/redis";
import type { Group } from "@/content/articles";

// Vercel の Upstash Redis をつなぐと、どちらかの名前で環境変数が入る
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
export const usingRedis = !!redis;

// Vercel 上でデータベースがつながっていないときは、黙ってメモリに保存せずにエラーにする。
// （Vercel ではメモリがすぐ消え、サーバーも複数あるので、回答が消えたり「回答済み」の判定がずれたりする）
export class StoreNotReady extends Error {}
function ensure() {
  if (!redis && process.env.VERCEL) throw new StoreNotReady("データベースが接続されていません");
}

// 画像アンケート（c1:）のデータと混ざらないよう、頭に c2: を付ける
const K = {
  counts: "c2:counts",
  codes: "c2:codes",
  pids: "c2:pids",
  logs: "c2:logs",
  p: (pid: string) => `c2:p:${pid}`,
  once: (pid: string) => `c2:once:${pid}`, // 1回しかできない操作（コメント・返信）の記録
};

export type Participant = {
  pid: string;
  group: Group;
  handle: string;
  code: string;
  createdAt: string;
  done: boolean;
  doneAt?: string;
};

export type LogRow = {
  at: string;
  pid: string;
  code: string;
  group: Group;
  type: "comment" | "reply" | "like" | "unlike" | "leave" | "nudge" | "finish";
  article?: string;
  target?: string; // いいね・返信の相手（コメント枠のID）
  text?: string;
  dwellMs?: number; // 記事を開いてからの時間
  result?: string; // 返信のすすめ（nudge）に対して「返信した／そのまま次へ」
};

// ローカル確認用（Redis がないとき）。globalThis に置いてルート間で共有する
type Mem = { counts: Record<string, number>; participants: Map<string, Participant>; codes: Set<string>; logs: LogRow[]; once: Map<string, Set<string>> };
const g = globalThis as unknown as { __c2mem?: Mem };
const mem: Mem = (g.__c2mem ??= { counts: {}, participants: new Map(), codes: new Set(), logs: [], once: new Map() });

// 人数が少ないほうの群に入れる（同じなら無作為）。Redis の中で一度に行うので、同時に来ても数がずれない
const ASSIGN_LUA = `
local a = tonumber(redis.call('HGET', KEYS[1], 'A') or '0')
local b = tonumber(redis.call('HGET', KEYS[1], 'B') or '0')
local g = ARGV[1]
if a < b then g = 'A' elseif b < a then g = 'B' end
redis.call('HINCRBY', KEYS[1], g, 1)
return g`;

export async function assignGroup(): Promise<Group> {
  ensure();
  const tie: Group = Math.random() < 0.5 ? "A" : "B";
  if (redis) return (await redis.eval(ASSIGN_LUA, [K.counts], [tie])) as Group;
  const a = mem.counts.A ?? 0;
  const b = mem.counts.B ?? 0;
  const pick: Group = a < b ? "A" : b < a ? "B" : tie;
  mem.counts[pick] = (mem.counts[pick] ?? 0) + 1;
  return pick;
}

export async function codeTaken(code: string) {
  ensure();
  return redis ? (await redis.sismember(K.codes, code)) === 1 : mem.codes.has(code);
}

export async function saveParticipant(p: Participant) {
  ensure();
  if (redis) {
    await redis.set(K.p(p.pid), p);
    await redis.sadd(K.codes, p.code);
    await redis.sadd(K.pids, p.pid);
  } else {
    mem.participants.set(p.pid, p);
    mem.codes.add(p.code);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function getParticipant(pid: string | undefined): Promise<Participant | null> {
  ensure();
  if (!pid || !UUID.test(pid)) return null;
  return redis ? await redis.get<Participant>(K.p(pid)) : mem.participants.get(pid) ?? null;
}

// 1回しかできない操作を「予約」する。初めてなら true、すでにしていたら false
export async function claimOnce(pid: string, key: string): Promise<boolean> {
  ensure();
  if (redis) return (await redis.sadd(K.once(pid), key)) === 1;
  const s = mem.once.get(pid) ?? new Set<string>();
  mem.once.set(pid, s);
  if (s.has(key)) return false;
  s.add(key);
  return true;
}

export async function releaseOnce(pid: string, key: string) {
  if (redis) await redis.srem(K.once(pid), key);
  else mem.once.get(pid)?.delete(key);
}

export async function onceList(pid: string): Promise<string[]> {
  ensure();
  return redis ? await redis.smembers(K.once(pid)) : [...(mem.once.get(pid) ?? [])];
}

export async function addLog(row: LogRow) {
  ensure();
  if (redis) await redis.rpush(K.logs, row);
  else mem.logs.push(row);
}

export async function allParticipants(): Promise<Participant[]> {
  ensure();
  if (!redis) return [...mem.participants.values()];
  const pids = await redis.smembers(K.pids);
  if (pids.length === 0) return [];
  const rows: Participant[] = [];
  for (let i = 0; i < pids.length; i += 100) {
    const part = await redis.mget<Participant[]>(...pids.slice(i, i + 100).map((x) => K.p(x)));
    rows.push(...(part.filter(Boolean) as Participant[]));
  }
  return rows;
}

export async function allLogs(): Promise<LogRow[]> {
  ensure();
  return redis ? await redis.lrange<LogRow>(K.logs, 0, -1) : mem.logs;
}
