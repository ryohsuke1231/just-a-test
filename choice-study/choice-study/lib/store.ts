import { Redis } from "@upstash/redis";
import { CONDS, WEIGHTS, type Cond } from "@/content/pairs";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
export const usingRedis = !!redis;

// キーの頭に c1: を付けて、コメント欄アプリと同じデータベースを使っても混ざらないようにする
const K = { counts: "c1:counts", codes: "c1:codes", pids: "c1:pids", trials: "c1:trials", p: (id: string) => `c1:p:${id}` };

export type Trial = {
  pair: string; // 組のID
  left: "a" | "b"; // 左に出した画像
};

export type Participant = {
  pid: string; // cookieに入れるUUID
  cond: Cond;
  code: string;
  createdAt: string;
  trials: Trial[]; // 出題順（開始時に決める）
  answered: number;
  done: boolean;
  doneAt?: string;
};

export type TrialRow = {
  at: string;
  pid: string;
  code: string;
  cond: Cond;
  index: number; // 何問目か（0始まり）
  pair: string;
  left: "a" | "b";
  chosen: "a" | "b";
  rtMs: number;
};

// ローカル確認用（Redisがないとき）。globalThis に置いて、ルート間で共有する
type Mem = { counts: Record<string, number>; participants: Map<string, Participant>; codes: Set<string>; trials: TrialRow[] };
const g = globalThis as unknown as { __c1mem?: Mem };
const mem: Mem = (g.__c1mem ??= { counts: {}, participants: new Map(), codes: new Set(), trials: [] });

// 人数（÷比）が一番少ない条件に割り当てる。同数のときは無作為
const ASSIGN_LUA = `
local best = nil
local bestv = nil
for i = 1, #ARGV, 2 do
  local v = tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0') / tonumber(ARGV[i + 1])
  if bestv == nil or v < bestv then best = ARGV[i]; bestv = v end
end
redis.call('HINCRBY', KEYS[1], best, 1)
return best`;

export async function assignCond(): Promise<Cond> {
  const order = [...CONDS].sort(() => Math.random() - 0.5); // 同数のときの順番を無作為に
  if (redis) {
    const args = order.flatMap((c) => [c, String(WEIGHTS[c])]);
    return (await redis.eval(ASSIGN_LUA, [K.counts], args)) as Cond;
  }
  let best = order[0];
  for (const c of order) if ((mem.counts[c] ?? 0) / WEIGHTS[c] < (mem.counts[best] ?? 0) / WEIGHTS[best]) best = c;
  mem.counts[best] = (mem.counts[best] ?? 0) + 1;
  return best;
}

export async function codeTaken(code: string) {
  return redis ? (await redis.sismember(K.codes, code)) === 1 : mem.codes.has(code);
}

export async function saveParticipant(p: Participant) {
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
  if (!pid || !UUID.test(pid)) return null;
  return redis ? await redis.get<Participant>(K.p(pid)) : mem.participants.get(pid) ?? null;
}

export async function addTrial(row: TrialRow) {
  if (redis) await redis.rpush(K.trials, row);
  else mem.trials.push(row);
}

export async function allParticipants(): Promise<Participant[]> {
  if (!redis) return [...mem.participants.values()];
  const pids = await redis.smembers(K.pids);
  if (pids.length === 0) return [];
  const rows = await redis.mget<Participant[]>(...pids.map((x) => K.p(x)));
  return rows.filter(Boolean) as Participant[];
}

export async function allTrials(): Promise<TrialRow[]> {
  return redis ? await redis.lrange<TrialRow>(K.trials, 0, -1) : mem.trials;
}
