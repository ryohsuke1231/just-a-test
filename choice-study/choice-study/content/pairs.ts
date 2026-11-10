// =============================================================
// 画像の組のデータ
// 画像は public/images/ に「ID + a/b + .jpg」で置きます（例：m01a.jpg）
//
// tier（組の種類）
//   even   … 互角の組（好みの差が小さいはず）
//   mid    … 中くらい（好みが分かれるが、どちらもあり得る）
//   strong … 好みがはっきりしているはず
//   ※ これは作る側の予想。実際の偏りは「数字なし」群の結果で確かめる
//
// high / low … 表示するいいね数（この調査のために設定した数字）
// highInX   … 条件 X のとき、多い数字を付ける画像（Y のときは逆になる）
//             a と b が半々になるようにしてあるので、1人の中でもかたよらない
// =============================================================

export type Tier = "even" | "mid" | "strong";

export type Pair = {
  id: string;
  tier: Tier;
  a: string; // 画像aの説明（CSVに出る）
  b: string;
  high: number;
  low: number;
  highInX: "a" | "b";
};

export const pairs: Pair[] = [
  // ---- 互角の組（模様。tools/make_images.py で生成） ----
  { id: "e01", tier: "even", a: "波模様1", b: "波模様2", high: 1243, low: 38, highInX: "a" },
  { id: "e02", tier: "even", a: "水玉1", b: "水玉2", high: 876, low: 21, highInX: "b" },
  { id: "e03", tier: "even", a: "ぼかし1", b: "ぼかし2", high: 1512, low: 47, highInX: "a" },
  { id: "e04", tier: "even", a: "しま1", b: "しま2", high: 694, low: 15, highInX: "b" },
  { id: "e05", tier: "even", a: "輪1", b: "輪2", high: 1087, low: 29, highInX: "a" },
  { id: "e06", tier: "even", a: "三角1", b: "三角2", high: 932, low: 34, highInX: "b" },

  // ---- 中くらい（写真に差し替える） ----
  { id: "m01", tier: "mid", a: "海", b: "山", high: 1368, low: 42, highInX: "a" },
  { id: "m02", tier: "mid", a: "桜", b: "紅葉", high: 759, low: 18, highInX: "b" },
  { id: "m03", tier: "mid", a: "都会", b: "田舎", high: 1124, low: 31, highInX: "a" },
  { id: "m04", tier: "mid", a: "朝日", b: "星空", high: 845, low: 26, highInX: "b" },

  // ---- 好みがはっきり（写真に差し替える） ----
  { id: "s01", tier: "strong", a: "犬", b: "猫", high: 1291, low: 36, highInX: "a" },
  { id: "s02", tier: "strong", a: "パン", b: "ごはん", high: 968, low: 23, highInX: "b" },
];

// 条件：none = 数字なし / X・Y = 数字あり（多い数字を付ける画像が逆）
export type Cond = "none" | "X" | "Y";
export const CONDS: Cond[] = ["none", "X", "Y"];

// 割り当ての比（none : X : Y）。人数 ÷ この数が一番小さい条件に入る
export const WEIGHTS: Record<Cond, number> = { none: 1, X: 1, Y: 1 };

// これより速い回答（ミリ秒）は「速すぎ」としてCSVに印を付ける
export const TOO_FAST_MS = 400;

export const QUESTION = "どちらの画像がよいと思いますか？";
