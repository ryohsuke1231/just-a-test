"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { QUESTION } from "@/content/pairs";

type Side = { src: string; likes: number | null };
type State = {
  started: boolean;
  done: boolean;
  total: number;
  current: { index: number; left: Side; right: Side } | null;
  preload: string[];
  code: string | null;
};
type Phase = "loading" | "intro" | "trial" | "thanks" | "already";

async function call(path: string, body?: object): Promise<State> {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通信に失敗しました。もう一度試してください");
  return data as State;
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call("/api/state")
      .then((s) => {
        setState(s);
        setPhase(s.done ? "already" : s.started ? "trial" : "intro");
      })
      .catch(() => setPhase("intro"));
  }, []);

  const start = async () => {
    setError("");
    try {
      const s = await call("/api/start", {});
      setState(s);
      setPhase(s.done ? "already" : "trial");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const answer = async (index: number, side: "left" | "right", rtMs: number) => {
    setError("");
    try {
      const s = await call("/api/answer", { index, side, rtMs });
      setState(s);
      if (s.done) setPhase("thanks");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };

  return (
    <main className="wrap">
      {phase === "loading" && <p className="muted center">読み込み中…</p>}
      {phase === "intro" && <Intro total={state?.total ?? 12} onStart={start} error={error} />}
      {phase === "trial" && state?.current && (
        <TrialView key={state.current.index} trial={state.current} total={state.total} preload={state.preload} onAnswer={answer} error={error} />
      )}
      {(phase === "thanks" || phase === "already") && <Finished code={state?.code ?? null} already={phase === "already"} />}
    </main>
  );
}

function Intro({ total, onStart, error }: { total: number; onStart: () => Promise<void>; error: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel">
      <h1>画像アンケート</h1>
      <p>画像が2枚ずつ、{total}回出てきます。よいと思うほうを選んでください。</p>
      <ul>
        <li>深く考えず、ぱっと見た感じで選んで大丈夫です。正解はありません。</li>
        <li>画像に数字（いいね数）が表示されることがあります。その数字は、この調査のために設定したもので、実際の人数ではありません。</li>
        <li>名前は記録されません。成績にも関係ありません。</li>
        <li>一度選ぶと、戻ったりやり直したりはできません。</li>
      </ul>
      <div className="center">
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await onStart(); setBusy(false); }}>
          はじめる
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function TrialView(props: {
  trial: { index: number; left: Side; right: Side };
  total: number;
  preload: string[];
  onAnswer: (index: number, side: "left" | "right", rtMs: number) => Promise<void>;
  error: string;
}) {
  const { trial } = props;
  const [loaded, setLoaded] = useState(0);
  const [picked, setPicked] = useState<"left" | "right" | null>(null);
  const shownAt = useRef<number | null>(null);
  const ready = loaded >= 2;

  // 2枚とも表示されてから時間を計りはじめる
  useEffect(() => {
    if (ready && shownAt.current === null) shownAt.current = performance.now();
  }, [ready]);

  // 次の問題の画像を先に読み込んでおく
  useEffect(() => {
    props.preload.forEach((src) => { const im = new Image(); im.src = src; });
  }, [props.preload]);

  const choose = async (side: "left" | "right") => {
    if (!ready || picked) return;
    const rt = performance.now() - (shownAt.current ?? performance.now());
    setPicked(side);
    await new Promise((r) => setTimeout(r, 220)); // 選んだことが見えるように少し待つ
    try {
      await props.onAnswer(trial.index, side, rt);
    } catch {
      setPicked(null);
    }
  };

  const card = (side: "left" | "right", s: Side) => (
    <button
      className={`card${picked === side ? " picked" : ""}${picked && picked !== side ? " dim" : ""}`}
      onClick={() => choose(side)}
      disabled={!ready || !!picked}
      aria-label={side === "left" ? "左の画像を選ぶ" : "右の画像を選ぶ"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.src} alt="" draggable={false} onLoad={() => setLoaded((n) => n + 1)} onError={() => setLoaded((n) => n + 1)} />
      {s.likes !== null && (
        <span className="likes">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.810 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
          {s.likes.toLocaleString("ja-JP")}
        </span>
      )}
    </button>
  );

  return (
    <div className="trial">
      <div className="progress">{trial.index + 1} / {props.total}</div>
      <h1 className="question">{QUESTION}</h1>
      <div className={`pairgrid${ready ? "" : " loading"}`}>
        {card("left", trial.left)}
        {card("right", trial.right)}
      </div>
      {props.error && <p className="error center">{props.error}</p>}
    </div>
  );
}

function Finished({ code, already }: { code: string | null; already: boolean }) {
  return (
    <div className="panel center">
      <h1>{already ? "回答は終わっています" : "ありがとうございました"}</h1>
      <p>フォームに戻って、次のコードを入力してください。</p>
      <div className="code-box">{code ?? "------"}</div>
      <p className="muted small">このコードは後日使うことがあるので、メモしておいてください。</p>
      <p className="waste"><Link href="/pong" className="waste-btn">時間をwasteしよう</Link></p>
    </div>
  );
}
