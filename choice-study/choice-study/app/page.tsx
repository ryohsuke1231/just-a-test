"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Reply = { id: string; author: string; time: string; likes: number; text: string };
type Comment = Reply & { reply: Reply | null };
type Article = { id: string; category: string; title: string; fictional: boolean; body: string[]; sourceNote: string | null; comments: Comment[] };
type View =
  | { status: "new" }
  | { status: "active"; handle: string; posted: string[]; replied: string[]; articles: Article[] }
  | { status: "done"; code: string };

const SITE = "トピックノート";

async function post<T>(path: string, body: object = {}): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通信に失敗しました。もう一度試してください");
  return data as T;
}

async function getState(): Promise<View> {
  const res = await fetch("/api/state", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "読み込めませんでした");
  return data as View;
}

export default function Page() {
  const [view, setView] = useState<View | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  const finish = useCallback(async () => {
    const r = await post<{ code: string }>("/api/finish");
    setView({ status: "done", code: r.code });
    window.scrollTo(0, 0);
  }, []);

  const apply = useCallback(
    async (v: View) => {
      if (v.status === "active" && v.posted.length >= v.articles.length) {
        await finish(); // 全部コメント済みなのに終了していなかったとき（通信が途中で切れたなど）
        return;
      }
      if (v.status === "active") setIndex(v.posted.length);
      setView(v);
    },
    [finish],
  );

  const load = useCallback(() => {
    setError("");
    getState().then(apply).catch((e) => setError((e as Error).message));
  }, [apply]);

  useEffect(load, [load]);

  // 「戻る」でこのページに戻ってきたとき（ブラウザがページを使い回したとき）も、最新の状態を読み直す
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) load(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [load]);

  const start = async () => {
    setError("");
    try {
      await apply(await post<View>("/api/start"));
      window.scrollTo(0, 0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const next = async () => {
    if (view?.status !== "active") return;
    setError("");
    if (index + 1 < view.articles.length) {
      setIndex(index + 1);
      window.scrollTo(0, 0);
      return;
    }
    try {
      await finish();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-name">トピック<span>ノート</span></div>
          <nav className="site-nav" aria-hidden>
            <span>トップ</span><span>国内</span><span>地域</span><span>暮らし</span><span>教育</span><span>スポーツ</span>
          </nav>
        </div>
      </header>
      <main>
        {!view && !error && <p className="center muted">読み込み中…</p>}
        {!view && error && (
          <div className="panel center">
            <p className="error">{error}</p>
            <button className="btn ghost" onClick={load}>もう一度読み込む</button>
          </div>
        )}
        {view?.status === "new" && <Intro onStart={start} error={error} />}
        {view?.status === "active" && (
          <ArticleView
            key={view.articles[index].id}
            article={view.articles[index]}
            position={index}
            total={view.articles.length}
            handle={view.handle}
            alreadyPosted={view.posted.includes(view.articles[index].id)}
            replied={view.replied}
            onPosted={(id) => setView({ ...view, posted: [...view.posted, id] })}
            onReplied={(id) => setView({ ...view, replied: [...view.replied, id] })}
            onNext={next}
            error={error}
          />
        )}
        {view?.status === "done" && <Finished code={view.code} />}
      </main>
    </>
  );
}

function Intro({ onStart, error }: { onStart: () => Promise<void>; error: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel">
      <h1>はじめに</h1>
      <p>このあと、ニュース記事とコメント欄を模したページを3つ見てもらいます。</p>
      <ul>
        <li>記事は、実際のニュースをまとめたもの2本と、架空の話題1本です。</li>
        <li><strong>コメントといいね数は、この調査のために用意したもの</strong>で、実在の人の投稿ではありません（実際のネットのコメントを参考に作っています）。</li>
        <li>ふだんネットを見ているときと同じ気持ちで読んで、それぞれの記事にあなたのコメントを1つ書いてください。</li>
        <li>共感したコメントにはいいねを、気になったコメントには<strong>できれば返信も</strong>してみてください（しなくても大丈夫です）。</li>
        <li>あなたのコメントや返信はランダムな表示名で記録され、ほかの参加者には表示されません。研究者が読み、後日の発表で誰のものかわからない形で紹介することがあります。名前など、人がわかることは書かないでください。</li>
        <li>途中で戻ったり、やり直したりはできません。</li>
      </ul>
      <div className="center">
        <button className="btn next" disabled={busy} onClick={async () => { setBusy(true); await onStart(); setBusy(false); }}>
          はじめる
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function Finished({ code }: { code: string }) {
  return (
    <>
      <div className="panel center">
        <h1>ご協力ありがとうございました</h1>
        <p>フォームに戻って、次のコードを入力してください。</p>
        <div className="code-box">{code}</div>
        <p className="muted small">このコードは後日使うことがあるので、メモしておいてください。</p>
      </div>
      <Link href="/pong" className="waste-btn">暇？</Link>
    </>
  );
}

// ---------------------------------------------------------------- 記事ページ

function ArticleView(props: {
  article: Article;
  position: number;
  total: number;
  handle: string;
  alreadyPosted: boolean;
  replied: string[];
  onPosted: (articleId: string) => void;
  onReplied: (commentId: string) => void;
  onNext: () => Promise<void>;
  error: string;
}) {
  const { article } = props;
  const openedAt = useRef(Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const [myComment, setMyComment] = useState<string | null>(null);
  const [myReplies, setMyReplies] = useState<Record<string, string>>({});
  const [nudge, setNudge] = useState<"no" | "showing" | "done">("no");
  const [leaving, setLeaving] = useState(false);
  const posted = props.alreadyPosted || myComment !== null;
  const repliedHere = article.comments.some((c) => props.replied.includes(c.id));
  const isLast = props.position === props.total - 1;

  const log = useCallback(
    (body: object) =>
      fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: article.id, dwellMs: Date.now() - openedAt.current, ...body }),
        keepalive: true,
      }).catch(() => {}),
    [article.id],
  );

  const goNext = async () => {
    // 返信をまだしていなければ、1回だけ返信をすすめる（強制はしない）
    if (!repliedHere && nudge === "no") {
      setNudge("showing");
      return;
    }
    setLeaving(true);
    log({ type: "leave" });
    await props.onNext();
    setLeaving(false);
  };

  const nudgeBack = () => {
    log({ type: "nudge", result: "back" });
    setNudge("done");
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nudgeSkip = async () => {
    log({ type: "nudge", result: "skip" });
    setNudge("done");
    setLeaving(true);
    log({ type: "leave" });
    await props.onNext();
    setLeaving(false);
  };

  const count = article.comments.length + article.comments.filter((c) => c.reply).length + (myComment ? 1 : 0) + Object.keys(myReplies).length;

  return (
    <article>
      <div className="crumb">{article.category}</div>
      {article.fictional && <div className="fiction-note">※この記事は架空の話題です</div>}
      <h1 className="title">{article.title}</h1>
      <div className="meta">{SITE}編集部{article.sourceNote ? `（${article.sourceNote}）` : ""}</div>
      <div className="article-body">
        {article.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <section className="comments" ref={listRef}>
        <div className="comments-head">
          <h2>コメント</h2>
          <span className="count">{count}件</span>
        </div>
        <p className="comments-note">共感したらいいね、気になったコメントには返信してみよう</p>
        <ul className="comment-list">
          {myComment && (
            <li className="comment mine">
              <Avatar name={props.handle} />
              <div className="comment-main">
                <div className="comment-top"><span className="name">{props.handle}</span>たった今</div>
                <p className="comment-text">{myComment}</p>
              </div>
            </li>
          )}
          {article.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              handle={props.handle}
              myReply={myReplies[c.id]}
              canReply={!props.replied.includes(c.id) && !myReplies[c.id]}
              onLike={(target, on) => log({ type: on ? "like" : "unlike", target })}
              onReply={async (text) => {
                const r = await post<{ text: string }>("/api/event", { type: "reply", article: article.id, target: c.id, text, dwellMs: Date.now() - openedAt.current });
                setMyReplies((m) => ({ ...m, [c.id]: r.text }));
                props.onReplied(c.id);
              }}
            />
          ))}
        </ul>

        {!posted ? (
          <PostBox
            handle={props.handle}
            onSubmit={async (text) => {
              const r = await post<{ text: string }>("/api/comment", { article: article.id, text, dwellMs: Date.now() - openedAt.current });
              setMyComment(r.text);
              props.onPosted(article.id);
            }}
          />
        ) : nudge === "showing" ? (
          <div className="nudge" role="dialog" aria-label="返信のおすすめ">
            <p>まだ返信をしていません。返信はしなくても大丈夫ですが、気になったコメントがあれば返信してみませんか？</p>
            <div className="nudge-actions">
              <button className="btn" onClick={nudgeBack}>コメントを見に戻る</button>
              <button className="btn ghost" disabled={leaving} onClick={nudgeSkip}>{isLast ? "このまま終わる" : "このまま次へ"}</button>
            </div>
          </div>
        ) : (
          <div className="next-area">
            <p>{props.alreadyPosted && !myComment ? "この記事にはコメント済みです。" : "コメントを投稿しました。"}</p>
            <button className="btn next" disabled={leaving} onClick={goNext}>{isLast ? "終わる" : "次の記事へ"}</button>
          </div>
        )}
        {props.error && <p className="error center">{props.error}</p>}
      </section>

      <div className="pager">{props.position + 1} / {props.total}</div>
    </article>
  );
}

function CommentItem(props: {
  comment: Comment;
  handle: string;
  myReply?: string;
  canReply: boolean;
  onLike: (target: string, on: boolean) => void;
  onReply: (text: string) => Promise<void>;
}) {
  const { comment: c } = props;
  const [open, setOpen] = useState(false);
  return (
    <li className="comment">
      <Avatar name={c.author} />
      <div className="comment-main">
        <div className="comment-top"><span className="name">{c.author}</span>{c.time}</div>
        <p className="comment-text">{c.text}</p>
        <div className="comment-actions">
          <LikeButton base={c.likes} onToggle={(on) => props.onLike(c.id, on)} />
          {props.canReply && (
            <button className="act reply-act" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <ReplyIcon /> 返信
            </button>
          )}
        </div>
        {open && props.canReply && (
          <ReplyForm to={c.author} onCancel={() => setOpen(false)} onSubmit={async (t) => { await props.onReply(t); setOpen(false); }} />
        )}
        {(c.reply || props.myReply) && (
          <div className="replies">
            {c.reply && (
              <div className="comment is-reply">
                <Avatar name={c.reply.author} />
                <div className="comment-main">
                  <div className="comment-top"><span className="name">{c.reply.author}</span>{c.reply.time}</div>
                  <p className="comment-text">{c.reply.text}</p>
                  <div className="comment-actions">
                    <LikeButton base={c.reply.likes} onToggle={(on) => props.onLike(c.reply!.id, on)} />
                  </div>
                </div>
              </div>
            )}
            {props.myReply && (
              <div className="comment is-reply mine">
                <Avatar name={props.handle} />
                <div className="comment-main">
                  <div className="comment-top"><span className="name">{props.handle}</span>たった今</div>
                  <p className="comment-text">{props.myReply}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// いいね数は太字で、ハートのすぐ横に出す（押すと1増える）
function LikeButton({ base, onToggle }: { base: number; onToggle: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <button className={`act like-act${on ? " on" : ""}`} aria-pressed={on} aria-label="いいね" onClick={() => { const v = !on; setOn(v); onToggle(v); }}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 0 : 2} />
      </svg>
      <span key={on ? "1" : "0"} className={`like-num${on ? " pop" : ""}`}>{(base + (on ? 1 : 0)).toLocaleString("ja-JP")}</span>
    </button>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function Avatar({ name }: { name: string }) {
  // 表示名から決まる落ち着いた色（毎回同じ色になる）
  const palette = ["#9aa8b5", "#b5a49a", "#a3b39a", "#b09ab5", "#9ab3b0", "#b5b09a"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <div className="avatar" style={{ background: palette[h % palette.length] }} aria-hidden>{name.replace("user_", "").charAt(0).toUpperCase()}</div>;
}

function PostBox({ handle, onSubmit }: { handle: string; onSubmit: (t: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const len = text.trim().length;
  return (
    <div className="post-box">
      <h3>あなたのコメントを書く</h3>
      <textarea value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="この記事についてのあなたの考えを書いてください" />
      <div className="post-row">
        <span className="hint">表示名：{handle}　{len}/200</span>
        <button
          className="btn"
          disabled={busy || len < 2}
          onClick={async () => {
            setBusy(true); setErr("");
            try { await onSubmit(text); } catch (e) { setErr((e as Error).message); }
            setBusy(false);
          }}
        >
          投稿する
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function ReplyForm({ to, onSubmit, onCancel }: { to: string; onSubmit: (t: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="reply-form">
      <textarea autoFocus value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={`${to} さんに返信`} />
      <div className="post-row" style={{ justifyContent: "flex-end" }}>
        <button className="btn small ghost" onClick={onCancel}>やめる</button>
        <button
          className="btn small"
          disabled={busy || text.trim().length < 2}
          onClick={async () => {
            setBusy(true); setErr("");
            try { await onSubmit(text); } catch (e) { setErr((e as Error).message); setBusy(false); }
          }}
        >
          返信する
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
