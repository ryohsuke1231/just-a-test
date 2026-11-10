"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Game, WIN_SCORE, type Ctl, type Snapshot } from "@/lib/pong/game";
import { connect, hostRoom, joinRoom, newRoomCode, quickMatch, type Session, type Transport } from "@/lib/pong/net";
import "./pong.css";

type Config = {
  mode: "cpu" | "local" | "online";
  left: Ctl;
  right: Ctl;
  cpuLevel?: 0 | 1 | 2;
  authority: boolean;
  labels: [string, string];
  mySide: 0 | 1 | null;
  session?: Session;
};

type Screen =
  | { name: "checking" }
  | { name: "locked" }
  | { name: "menu" }
  | { name: "cpu" }
  | { name: "online" }
  | { name: "waiting"; text: string; code?: string }
  | { name: "game"; config: Config };

export default function PongPage() {
  const [screen, setScreen] = useState<Screen>({ name: "checking" });
  const [notice, setNotice] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const transport = useRef<Transport | null>(null);
  const cancelWait = useRef<(() => void) | null>(null);

  // 回答を終えた人だけ遊べる
  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => setScreen(s.done ? { name: "menu" } : { name: "locked" }))
      .catch(() => setScreen({ name: "locked" }));
    return () => {
      cancelWait.current?.();
      transport.current?.close();
    };
  }, []);

  const getTransport = async () => {
    if (transport.current) return transport.current;
    const kind = new URLSearchParams(location.search).get("transport") === "local" ? "local" : "ably";
    transport.current = await connect(kind);
    return transport.current;
  };

  const startOnline = (s: Session) => {
    cancelWait.current = null;
    setScreen({
      name: "game",
      config: {
        mode: "online",
        left: s.isHost ? "keys-both" : "remote",
        right: s.isHost ? "remote" : "keys-both",
        authority: s.isHost,
        labels: s.isHost ? ["あなた", "あいて"] : ["あいて", "あなた"],
        mySide: s.isHost ? 0 : 1,
        session: s,
      },
    });
  };

  const online = async (action: "quick" | "create" | "join") => {
    setNotice("");
    setScreen({ name: "waiting", text: "接続しています…" });
    let tp: Transport;
    try {
      tp = await getTransport();
    } catch {
      setNotice("オンライン対戦に接続できませんでした。時間をおいて試してください。");
      setScreen({ name: "online" });
      return;
    }
    try {
      if (action === "quick") {
        setScreen({ name: "waiting", text: "対戦相手をさがしています…" });
        cancelWait.current = await quickMatch(tp, startOnline);
      } else if (action === "create") {
        const code = newRoomCode();
        setScreen({ name: "waiting", text: "この番号を相手に伝えてください", code });
        cancelWait.current = await hostRoom(tp, code, startOnline);
      } else {
        setScreen({ name: "waiting", text: "部屋に入っています…" });
        startOnline(await joinRoom(tp, joinCode));
      }
    } catch (e) {
      const m = (e as Error).message;
      setNotice(m === "full" ? "その部屋はもう対戦中です。" : m === "notfound" ? "部屋が見つかりませんでした。番号を確認してください。" : "うまくつながりませんでした。もう一度試してください。");
      setScreen({ name: "online" });
    }
  };

  const cancel = () => {
    cancelWait.current?.();
    cancelWait.current = null;
    setScreen({ name: "online" });
  };

  const toMenu = useCallback(() => setScreen({ name: "menu" }), []);

  return (
    <div className="pong">
      <header className="pong-head">
        <span className="pong-title">PONG</span>
        <Link href="/" className="pong-link">もどる</Link>
      </header>

      {screen.name === "checking" && <p className="pong-msg">読み込み中…</p>}

      {screen.name === "locked" && (
        <div className="pong-menu">
          <p className="pong-msg">先にアンケートの回答を終わらせてください。</p>
          <Link href="/" className="pong-btn">アンケートへ</Link>
        </div>
      )}

      {screen.name === "menu" && (
        <div className="pong-menu">
          <p className="pong-msg">{WIN_SCORE}点先取。モードを選んでください。</p>
          <button className="pong-btn" onClick={() => setScreen({ name: "cpu" })}>CPUと対戦</button>
          <button
            className="pong-btn"
            onClick={() => setScreen({ name: "game", config: { mode: "local", left: "keys-ws", right: "keys-arrows", authority: true, labels: ["W / S キー", "↑ / ↓ キー"], mySide: null } })}
          >
            2人で対戦（同じ端末）
          </button>
          <button className="pong-btn" onClick={() => { setNotice(""); setScreen({ name: "online" }); }}>オンライン対戦</button>
        </div>
      )}

      {screen.name === "cpu" && (
        <div className="pong-menu">
          <p className="pong-msg">CPUの強さ</p>
          {(["よわい", "ふつう", "つよい"] as const).map((label, lv) => (
            <button
              key={label}
              className="pong-btn"
              onClick={() => setScreen({ name: "game", config: { mode: "cpu", left: "keys-both", right: "cpu", cpuLevel: lv as 0 | 1 | 2, authority: true, labels: ["あなた", `CPU（${label}）`], mySide: 0 } })}
            >
              {label}
            </button>
          ))}
          <button className="pong-btn ghost" onClick={toMenu}>もどる</button>
        </div>
      )}

      {screen.name === "online" && (
        <div className="pong-menu">
          {notice && <p className="pong-notice">{notice}</p>}
          <button className="pong-btn" onClick={() => online("quick")}>だれかと対戦（おまかせ）</button>
          <button className="pong-btn" onClick={() => online("create")}>部屋を作る</button>
          <form
            className="pong-join"
            onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(joinCode)) online("join"); }}
          >
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="部屋番号"
              aria-label="部屋番号（4けた）"
            />
            <button className="pong-btn" disabled={!/^\d{4}$/.test(joinCode)}>入る</button>
          </form>
          <button className="pong-btn ghost" onClick={toMenu}>もどる</button>
        </div>
      )}

      {screen.name === "waiting" && (
        <div className="pong-menu">
          <p className="pong-msg">{screen.text}</p>
          {screen.code && <p className="pong-code">{screen.code}</p>}
          <button className="pong-btn ghost" onClick={cancel}>とりけし</button>
        </div>
      )}

      {screen.name === "game" && <GameView key={screen.config.session?.room ?? screen.config.mode + (screen.config.cpuLevel ?? "")} config={screen.config} onExit={toMenu} />}
    </div>
  );
}

function GameView({ config, onExit }: { config: Config; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const chan = config.session?.chan;
    const g = new Game({
      canvas: canvas.current!,
      left: config.left,
      right: config.right,
      cpuLevel: config.cpuLevel,
      authority: config.authority,
      labels: config.labels,
      send: chan ? (m) => chan.publish(m) : undefined,
      onChange: setSnap,
    });
    game.current = g;
    chan?.onMessage((d, from) => {
      // 対戦中の部屋に別の人が入ろうとしたら「満員」と返す
      if (d?.t === "join") { if (config.authority) chan.publish({ t: "full", to: from }); return; }
      g.receive(d);
    });
    return () => {
      g.destroy();
      chan?.close();
      game.current = null;
    };
  }, [config]);

  let result = "";
  if (snap?.phase === "over") {
    if (snap.lost === "left") result = "相手が退出しました";
    else if (snap.lost === "timeout") result = "通信が切れました";
    else if (config.mySide === null) result = snap.winner === 0 ? "左の勝ち！" : "右の勝ち！";
    else result = snap.winner === config.mySide ? "あなたの勝ち！" : "あなたの負け…";
  }

  return (
    <div className="pong-game">
      <div className="pong-stage">
        <canvas ref={canvas} />
        {snap?.phase === "ready" && <div className="pong-overlay"><p className="pong-big">よーい…</p></div>}
        {snap?.phase === "over" && (
          <div className="pong-overlay">
            <p className="pong-big">{result}</p>
            <p className="pong-score">{snap.score[0]} - {snap.score[1]}</p>
            {!snap.lost && (
              <>
                {config.mode === "online" && snap.myAgain && !snap.remoteAgain && <p className="pong-msg">相手の返事を待っています…</p>}
                {config.mode === "online" && snap.remoteAgain && !snap.myAgain && <p className="pong-msg">相手が「もう一回」を押しました</p>}
                <button className="pong-btn" disabled={snap.myAgain} onClick={() => game.current?.requestAgain()}>もう一回</button>
              </>
            )}
            <button className="pong-btn ghost" onClick={onExit}>メニューへ</button>
          </div>
        )}
      </div>
      <div className="pong-foot">
        <span>
          {config.mode === "local"
            ? "左：W / S キー（タッチは画面の左半分）　右：↑ / ↓ キー（タッチは右半分）"
            : "操作：↑ / ↓ キー、W / S キー、マウス、タッチ"}
        </span>
        {snap?.phase !== "over" && <button className="pong-link" onClick={onExit}>やめる</button>}
      </div>
    </div>
  );
}
