import { cookies } from "next/headers";
import { pairs, type Cond, type Pair } from "@/content/pairs";
import { getParticipant, type Participant, type Trial } from "@/lib/store";
import { randomInt } from "crypto";

export const COOKIE = "pid";

export async function currentParticipant(): Promise<Participant | null> {
  const jar = await cookies();
  return getParticipant(jar.get(COOKIE)?.value);
}

// 完了コード：見間違えやすい 0/O, 1/I/L, 2/Z, 5/S, 8/B を除く
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY34679";
export function newCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

export function shuffledTrials(): Trial[] {
  const list = pairs.map((p) => ({ pair: p.id, left: (randomInt(2) === 0 ? "a" : "b") as "a" | "b" }));
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const pairById = (id: string) => pairs.find((p) => p.id === id) as Pair;

// その条件で、多い数字が付く画像（数字なし群では null）
export function highImage(pair: Pair, cond: Cond): "a" | "b" | null {
  if (cond === "none") return null;
  if (cond === "X") return pair.highInX;
  return pair.highInX === "a" ? "b" : "a";
}

// 画面に渡す情報。どちらが a/b か、組の種類などは渡さない
export function clientView(p: Participant) {
  const t = p.done ? null : p.trials[p.answered];
  let current = null;
  if (t) {
    const pair = pairById(t.pair);
    const hi = highImage(pair, p.cond);
    const right = t.left === "a" ? "b" : "a";
    const likes = (img: "a" | "b") => (hi === null ? null : hi === img ? pair.high : pair.low);
    current = {
      index: p.answered,
      left: { src: `/images/${pair.id}${t.left}.jpg`, likes: likes(t.left) },
      right: { src: `/images/${pair.id}${right}.jpg`, likes: likes(right) },
    };
  }
  // 次の問題の画像を先読みするためのURL
  const next = !p.done && p.trials[p.answered + 1] ? [`/images/${p.trials[p.answered + 1].pair}a.jpg`, `/images/${p.trials[p.answered + 1].pair}b.jpg`] : [];
  return { started: true, done: p.done, total: p.trials.length, current, preload: next, code: p.done ? p.code : null };
}
