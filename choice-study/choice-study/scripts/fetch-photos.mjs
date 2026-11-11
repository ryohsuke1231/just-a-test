// ビルドの前に自動で動くスクリプト（package.json の "prebuild"）
//
// content/photos.json に書いた Wikimedia Commons の写真を public/images/ にダウンロードし、
// ライセンス・作者名・出典URLを public/images/credits.json に書き出す。
//
// ・ダウンロードに失敗したらビルドを止める（仮の画像のまま本番に出ないように）
// ・SKIP_PHOTO_FETCH=1 のときは何もしない（ネットにつながらない環境で試すとき用）

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "images");
const API = "https://commons.wikimedia.org/w/api.php";
// Wikimediaは、自動で取得するときに名乗ることを求めている
const UA = "choice-study-build/1.0 (school inquiry project; https://www.mediawiki.org/wiki/API:Etiquette)";
const WIDTH = 960; // Wikimediaが用意している標準の幅

if (process.env.SKIP_PHOTO_FETCH === "1") {
  console.log("[photos] SKIP_PHOTO_FETCH=1 なので写真のダウンロードを省略します");
  process.exit(0);
}

const { photos } = JSON.parse(await readFile(join(root, "content", "photos.json"), "utf8"));
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as) {
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      return as === "json" ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (e.fatal || i === 4) throw e;
      await sleep(1500 * i);
    }
  }
}

const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const credits = [];
const failures = [];

for (const p of photos) {
  try {
    const q = new URLSearchParams({
      action: "query",
      titles: "File:" + p.commons,
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime",
      iiurlwidth: String(WIDTH),
      format: "json",
      formatversion: "2",
    });
    const data = await get(`${API}?${q}`, "json");
    const page = data?.query?.pages?.[0];
    const info = page?.imageinfo?.[0];
    if (!info) throw new Error("Commonsにファイルが見つかりません");
    const meta = info.extmetadata ?? {};
    const license = plain(meta.LicenseShortName?.value);
    if (!license) throw new Error("ライセンスが確認できません");

    const img = await get(info.thumburl || info.url, "buffer");
    if (img.length < 10_000) throw new Error("画像が小さすぎます（取得失敗の可能性）");
    await writeFile(join(outDir, p.file), img);

    credits.push({
      file: p.file,
      label: p.label,
      title: page.title.replace(/^File:/, ""),
      author: plain(meta.Artist?.value) || "不明",
      license,
      licenseUrl: meta.LicenseUrl?.value ?? "",
      source: info.descriptionurl,
    });
    console.log(`[photos] ${p.file} ← ${p.commons}（${license}）`);
  } catch (e) {
    failures.push(`${p.file}（${p.commons}）: ${e.message}`);
  }
  await sleep(300); // 相手のサーバーに負担をかけないよう、少し間をあける
}

if (failures.length) {
  console.error("\n[photos] 写真を取得できませんでした。content/photos.json のファイル名を確認してください：");
  for (const f of failures) console.error("  - " + f);
  console.error("（一時的な問題なら、Vercelで Redeploy すると直ることがあります）\n");
  process.exit(1);
}

await writeFile(join(outDir, "credits.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), photos: credits }, null, 2));
const size = (await Promise.all(photos.map((p) => stat(join(outDir, p.file))))).reduce((a, s) => a + s.size, 0);
console.log(`[photos] ${credits.length}枚、合計 ${(size / 1024 / 1024).toFixed(1)} MB`);
