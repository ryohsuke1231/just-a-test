"use client";

import { useEffect, useState } from "react";

type Credit = { file: string; label: string; title: string; author: string; license: string; licenseUrl: string; source: string };

// 画像の出典ページ。写真の情報はビルド時に Wikimedia Commons から取得したもの（public/images/credits.json）
export default function Credits() {
  const [photos, setPhotos] = useState<Credit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/images/credits.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPhotos(d.photos))
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="wrap credits">
      <h1>画像の出典</h1>
      <p className="muted small">
        この調査で使っている写真は、Wikimedia Commons で公開されているものです。それぞれのライセンスにしたがって利用しています。
        模様の画像は、この調査のために作成したものです。
      </p>
      {failed && <p className="muted">出典情報を読み込めませんでした。</p>}
      {photos && (
        <table>
          <thead>
            <tr><th>画像</th><th>作者</th><th>ライセンス</th><th>出典</th></tr>
          </thead>
          <tbody>
            {photos.map((p) => (
              <tr key={p.file}>
                <td>{p.label}</td>
                <td>{p.author}</td>
                <td>{p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noreferrer">{p.license}</a> : p.license}</td>
                <td><a href={p.source} target="_blank" rel="noreferrer">{p.title}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
