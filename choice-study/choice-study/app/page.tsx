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
      {phase !== "loading" && (
        <footer className="site-foot">
          <Link href="/credits" target="_blank">画像の出典</Link>
        </footer>
      )}
    </main>
  );
}

function Intro({ total, onStart, error }: { total: number; onStart: () => Promise<void>; error: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel">
      <h1>画像アンケート</h1>
      <p>SNSの投稿のような画像が2枚ずつ、{total}回出てきます。「いいね」したいと思うほうを選んでください。</p>
      <ul>
        <li>深く考えず、ふだんSNSを見ているときと同じ気持ちで選んで大丈夫です。正解はありません。</li>
        <li>画像に「いいね」の数が表示されることがあります。その数は、この調査のために設定したもので、実際の人数ではありません。</li>
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
    await new Promise((r) => setTimeout(r, 550)); // ハートが付いて数が1増えるのが見えるように待つ
    try {
      await props.onAnswer(trial.index, side, rt);
    } catch {
      setPicked(null);
    }
  };

  return (
    <div className="trial">
      <div className="progress">{trial.index + 1} / {props.total}</div>
      <h1 className="question">{QUESTION}</h1>
      <div className={`pairgrid${ready ? "" : " loading"}`}>
        {(["left", "right"] as const).map((side) => (
          <Post
            key={side}
            side={side}
            data={trial[side]}
            liked={picked === side}
            dimmed={!!picked && picked !== side}
            disabled={!ready || !!picked}
            onLoad={() => setLoaded((n) => n + 1)}
            onChoose={() => choose(side)}
          />
        ))}
      </div>
      <p className="hint">画像かハートを押すと「いいね」できます</p>
      {props.error && <p className="error center">{props.error}</p>}
    </div>
  );
}

// SNSの投稿風のカード。数字なし群では、数の代わりに「いいね」とだけ表示する（見た目の大きさは同じ）
function Post(props: {
  side: "left" | "right";
  data: Side;
  liked: boolean;
  dimmed: boolean;
  disabled: boolean;
  onLoad: () => void;
  onChoose: () => void;
}) {
  const { data, liked } = props;
  const label = props.side === "left" ? "左の投稿" : "右の投稿";
  return (
    <article className={`post${liked ? " liked" : ""}${props.dimmed ? " dim" : ""}`}>
      <button className="post-img" onClick={props.onChoose} disabled={props.disabled} aria-label={`${label}にいいねする`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.src} alt="" draggable={false} onLoad={props.onLoad} onError={props.onLoad} />
        {liked && <Heart className="burst" filled />}
      </button>
      <div className="post-bar">
        <button className="like-btn" onClick={props.onChoose} disabled={props.disabled} aria-pressed={liked} aria-label={`${label}にいいねする`}>
          <Heart filled={liked} />
        </button>
        {data.likes !== null ? (
          <span className="like-count">
            <strong key={liked ? "on" : "off"} className={liked ? "pop" : ""}>{(data.likes + (liked ? 1 : 0)).toLocaleString("ja-JP")}</strong>
            <span>件のいいね</span>
          </span>
        ) : (
          <span className="like-count"><span>いいね</span></span>
        )}
      </div>
    </article>
  );
}

function Heart({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
      />
    </svg>
  );
}

function Finished({ code, already }: { code: string | null; already: boolean }) {
  return (
    <>
      <div className="panel center">
        <h1>{already ? "回答は終わっています" : "ありがとうございました"}</h1>
        <p>フォームに戻って、次のコードを入力してください。</p>
        <div className="code-box">{code ?? "------"}</div>
        <p className="muted small">このコードは後日使うことがあるので、メモしておいてください。</p>
      </div>
      <Link href="/pong" className="waste-btn">暇？</Link>
    </>
  );
}
