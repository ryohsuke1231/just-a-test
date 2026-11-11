// 投稿の文字チェック（ごく簡単な不適切語フィルター。必要に応じて追加）
const NG = ["死ね", "しね", "殺す", "ころす", "きもい", "キモい", "うざい", "ウザい", "消えろ", "ブス", "バカ", "ばか", "アホ"];

export function checkText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "文を入力してください" };
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 2) return { ok: false, error: "2文字以上で入力してください" };
  if (text.length > 200) return { ok: false, error: "200文字以内で入力してください" };
  if (NG.some((w) => text.includes(w))) return { ok: false, error: "使えない言葉が含まれています" };
  if (/https?:\/\//i.test(text)) return { ok: false, error: "URLは入力できません" };
  return { ok: true, text };
}

export const dwell = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(3_600_000, Math.round(v))) : undefined);
