// Pong 本体（描画と当たり判定）。Reactには依存しない
//
// オンライン対戦の考え方：
//   ・自分のパドルに当たったか外したかは、自分の端末が決めて相手に知らせる
//     （通信の遅れがあっても「当てたのに外れた」が起きない）
//   ・相手側にボールが届いたら、相手からの知らせ（hit / miss）が来るまでそこで待つ
//   ・サーブと点数は部屋を作った側（authority）が決める
//
// 画面の大きさ：
//   ゲームの中はいつも 800×500 の座標で計算し、描くときだけ画面の大きさに拡大・縮小する。
//   オンライン対戦で送るパドルの位置やボールの速さもこの座標なので、
//   相手と画面の大きさが違っても、同じ割合の位置・同じ速さになる

export const W = 800;
export const H = 500;
const PAD_H = 90;
const PAD_W = 12;
const PAD_X = 28;
const BALL_R = 8;
export const WIN_SCORE = 7;
const START_SPEED = 430;
const MAX_SPEED = 900;
const KEY_SPEED = 560;
const CPU_SPEED = [230, 350, 520];
const CPU_ERROR = [70, 38, 12];
export const PIXEL_FONT = '"DotGothic16", ui-monospace, monospace';

export type Ctl = "keys-ws" | "keys-arrows" | "keys-both" | "cpu" | "remote";

export type Msg =
  | { t: "pad"; y: number }
  | { t: "serve"; n: number; dir: 1 | -1; vy: number; sl: number; sr: number }
  | { t: "hit"; n: number; y: number; vx: number; vy: number }
  | { t: "miss"; n: number }
  | { t: "again" }
  | { t: "bye" };

export type Snapshot = {
  phase: "ready" | "play" | "over";
  score: [number, number];
  winner: 0 | 1 | null;
  myAgain: boolean;
  remoteAgain: boolean;
  lost: null | "left" | "timeout"; // 相手が退出した／通信が切れた
};

export type GameOptions = {
  canvas: HTMLCanvasElement;
  left: Ctl;
  right: Ctl;
  cpuLevel?: 0 | 1 | 2;
  authority: boolean;
  send?: (m: Msg) => void;
  labels: [string, string];
  onChange: (s: Snapshot) => void;
};

type Phase = "ready" | "play" | "hold" | "point" | "over";

export class Game {
  private ctx: CanvasRenderingContext2D;
  private ctl: [Ctl, Ctl];
  private pad: [number, number] = [H / 2, H / 2];
  private padTarget: [number, number] = [H / 2, H / 2];
  private ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: START_SPEED };
  private phase: Phase = "ready";
  private score: [number, number] = [0, 0];
  private seq = 0;
  private passed = false;
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cpuErr = 0;
  private online: boolean;
  private lastRemote = performance.now();
  private lastSent = 0;
  private lastSentY = -1;
  private myAgain = false;
  private remoteAgain = false;
  private lost: Snapshot["lost"] = null;
  private stopped = false;
  private observer: ResizeObserver;

  constructor(private o: GameOptions) {
    this.ctx = o.canvas.getContext("2d")!;
    this.ctl = [o.left, o.right];
    this.online = o.left === "remote" || o.right === "remote";
    // 画面の大きさが変わるたびに、キャンバスの解像度を合わせる（高解像度の画面でもぼやけない）
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(o.canvas);
    this.resize();

    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    o.canvas.addEventListener("pointerdown", this.onPointer);
    o.canvas.addEventListener("pointermove", this.onPointer);

    this.emit();
    if (o.authority) this.scheduleServe(1500, Math.random() < 0.5 ? 1 : -1);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------- 外から呼ぶもの

  destroy(sayBye = true) {
    if (this.stopped) return;
    this.stopped = true;
    if (sayBye && this.online) this.o.send?.({ t: "bye" });
    cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    this.observer.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    const c = this.o.canvas;
    c.removeEventListener("pointerdown", this.onPointer);
    c.removeEventListener("pointermove", this.onPointer);
  }

  // 「もう一回」
  requestAgain() {
    if (this.phase !== "over" || this.lost) return;
    if (!this.online) return this.restart();
    this.myAgain = true;
    this.o.send?.({ t: "again" });
    this.emit();
    if (this.o.authority && this.remoteAgain) this.restart();
  }

  // 相手からのメッセージ
  receive(m: Msg) {
    if (!m || typeof m !== "object" || this.stopped) return;
    this.lastRemote = performance.now();
    const remote = this.ctl[0] === "remote" ? 0 : 1;
    switch (m.t) {
      case "pad":
        if (Number.isFinite(m.y)) this.padTarget[remote] = clampPad(m.y);
        break;
      case "serve":
        if (this.o.authority || !(m.n > this.seq)) break;
        this.seq = m.n;
        this.score = [m.sl | 0, m.sr | 0];
        this.myAgain = this.remoteAgain = false;
        this.startBall(m.dir === 1 ? 1 : -1, Number(m.vy) || 0);
        break;
      case "hit":
        if (!(m.n > this.seq) || (this.phase !== "play" && this.phase !== "hold")) break;
        this.seq = m.n;
        this.ball.x = planeX(remote);
        this.ball.y = Math.max(BALL_R, Math.min(H - BALL_R, Number(m.y) || H / 2));
        this.ball.vx = Number(m.vx) || 0;
        this.ball.vy = Number(m.vy) || 0;
        this.ball.speed = Math.min(MAX_SPEED, Math.hypot(this.ball.vx, this.ball.vy));
        this.passed = false;
        this.phase = "play";
        break;
      case "miss":
        if (m.n < this.seq || (this.phase !== "play" && this.phase !== "hold")) break;
        this.point(remote === 0 ? 1 : 0);
        break;
      case "again":
        this.remoteAgain = true;
        this.emit();
        if (this.o.authority && this.myAgain && this.phase === "over") this.restart();
        break;
      case "bye":
        this.lose("left");
        break;
    }
  }

  // ---------------------------------------------------------- 進行

  private restart() {
    this.score = [0, 0];
    this.myAgain = this.remoteAgain = false;
    this.phase = "ready";
    this.emit();
    this.scheduleServe(1200, Math.random() < 0.5 ? 1 : -1);
  }

  private scheduleServe(delay: number, dir: 1 | -1) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.stopped || this.lost) return;
      const vy = (Math.random() * 2 - 1) * 180;
      this.seq += 1;
      this.o.send?.({ t: "serve", n: this.seq, dir, vy, sl: this.score[0], sr: this.score[1] });
      this.startBall(dir, vy);
    }, delay);
  }

  private startBall(dir: 1 | -1, vy: number) {
    const b = this.ball;
    b.x = W / 2;
    b.y = H / 2;
    b.speed = START_SPEED;
    b.vy = vy;
    b.vx = dir * Math.sqrt(Math.max(1, START_SPEED * START_SPEED - vy * vy));
    this.passed = false;
    this.newCpuError();
    this.phase = "play";
    this.emit();
  }

  // side が外した → 反対側の得点
  private point(scorer: 0 | 1) {
    this.score[scorer] += 1;
    if (this.score[scorer] >= WIN_SCORE) {
      this.phase = "over";
    } else {
      this.phase = "point";
      // 点を取られた側に向けてサーブ
      if (this.o.authority) this.scheduleServe(1100, scorer === 0 ? 1 : -1);
    }
    this.emit();
  }

  private lose(why: "left" | "timeout") {
    if (this.lost) return;
    this.lost = why;
    if (this.timer) clearTimeout(this.timer);
    if (this.phase !== "over") this.phase = "over";
    this.emit();
  }

  private emit() {
    const over = this.phase === "over";
    const winner = over && !this.lost ? (this.score[0] > this.score[1] ? 0 : 1) : null;
    this.o.onChange({
      phase: over ? "over" : this.phase === "ready" ? "ready" : "play",
      score: [this.score[0], this.score[1]],
      winner,
      myAgain: this.myAgain,
      remoteAgain: this.remoteAgain,
      lost: this.lost,
    });
  }

  // ---------------------------------------------------------- 毎フレーム

  private frame = (now: number) => {
    if (this.stopped) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.movePaddles(dt);
    if (this.phase === "play") this.moveBall(dt);
    if (this.online) this.netTick(now);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private movePaddles(dt: number) {
    for (const side of [0, 1] as const) {
      const c = this.ctl[side];
      if (c === "remote") {
        // 受け取った位置へなめらかに寄せる
        const d = this.padTarget[side] - this.pad[side];
        this.pad[side] += Math.sign(d) * Math.min(Math.abs(d), 1400 * dt);
      } else if (c === "cpu") {
        const lv = this.o.cpuLevel ?? 1;
        const toward = this.phase === "play" && (side === 0 ? this.ball.vx < 0 : this.ball.vx > 0);
        const target = toward ? this.ball.y + this.cpuErr : H / 2;
        const speed = toward ? CPU_SPEED[lv] : CPU_SPEED[lv] * 0.5;
        const d = target - this.pad[side];
        if (Math.abs(d) > 4) this.pad[side] = clampPad(this.pad[side] + Math.sign(d) * Math.min(Math.abs(d), speed * dt));
      } else {
        let dir = 0;
        const ws = c === "keys-ws" || c === "keys-both";
        const ar = c === "keys-arrows" || c === "keys-both";
        if ((ws && this.keys.has("w")) || (ar && this.keys.has("arrowup"))) dir -= 1;
        if ((ws && this.keys.has("s")) || (ar && this.keys.has("arrowdown"))) dir += 1;
        if (dir !== 0) this.pad[side] = clampPad(this.pad[side] + dir * KEY_SPEED * dt);
      }
    }
  }

  private moveBall(dt: number) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < BALL_R) { b.y = 2 * BALL_R - b.y; b.vy = Math.abs(b.vy); }
    if (b.y > H - BALL_R) { b.y = 2 * (H - BALL_R) - b.y; b.vy = -Math.abs(b.vy); }

    const side: 0 | 1 | null = b.vx < 0 ? 0 : b.vx > 0 ? 1 : null;
    if (side === null) return;
    const plane = planeX(side);
    const reached = side === 0 ? b.x <= plane : b.x >= plane;

    if (reached && !this.passed) {
      if (this.ctl[side] === "remote") {
        // 相手の判定待ち
        b.x = plane;
        this.phase = "hold";
        return;
      }
      if (Math.abs(b.y - this.pad[side]) <= PAD_H / 2 + BALL_R) {
        const rel = Math.max(-1, Math.min(1, (b.y - this.pad[side]) / (PAD_H / 2)));
        // 当たった位置で角度が決まる。毎回少しだけずらして、まっすぐの打ち合いが続かないようにする
        const angle = (rel * 50 + (Math.random() * 8 - 4)) * (Math.PI / 180);
        b.speed = Math.min(MAX_SPEED, b.speed * 1.06);
        b.vx = (side === 0 ? 1 : -1) * b.speed * Math.cos(angle);
        b.vy = b.speed * Math.sin(angle);
        b.x = plane;
        this.seq += 1;
        this.newCpuError();
        this.o.send?.({ t: "hit", n: this.seq, y: b.y, vx: b.vx, vy: b.vy });
      } else {
        this.passed = true;
      }
    }
    if (this.passed && (b.x < -BALL_R * 3 || b.x > W + BALL_R * 3)) {
      this.o.send?.({ t: "miss", n: this.seq });
      this.point(side === 0 ? 1 : 0);
    }
  }

  private netTick(now: number) {
    const mine = this.ctl[0] === "remote" ? 1 : 0;
    const y = Math.round(this.pad[mine]);
    // 動いたときは約12回/秒、止まっていても1秒に1回は送る（接続確認を兼ねる）
    if ((y !== this.lastSentY && now - this.lastSent > 80) || now - this.lastSent > 1000) {
      this.o.send?.({ t: "pad", y });
      this.lastSent = now;
      this.lastSentY = y;
    }
    if (!this.lost && now - this.lastRemote > 7000) this.lose("timeout");
  }

  private newCpuError() {
    const lv = this.o.cpuLevel ?? 1;
    this.cpuErr = (Math.random() * 2 - 1) * CPU_ERROR[lv];
  }

  // ---------------------------------------------------------- 描画

  private resize() {
    const c = this.o.canvas;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    // 以降は 800×500 の座標で描けば、画面いっぱいに拡大される
    this.ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    if (this.stopped === false && this.last) this.draw();
  }

  private draw() {
    const g = this.ctx;
    g.fillStyle = "#111";
    g.fillRect(0, 0, W, H);

    g.strokeStyle = "#444";
    g.lineWidth = 4;
    g.setLineDash([14, 14]);
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, H);
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = "#555";
    g.font = `80px ${PIXEL_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(String(this.score[0]), W / 2 - 90, 24);
    g.fillText(String(this.score[1]), W / 2 + 90, 24);

    g.fillStyle = "#777";
    g.font = `20px ${PIXEL_FONT}`;
    g.textBaseline = "bottom";
    g.fillText(this.o.labels[0], W / 4, H - 10);
    g.fillText(this.o.labels[1], (W * 3) / 4, H - 10);

    g.fillStyle = "#fff";
    g.fillRect(PAD_X, this.pad[0] - PAD_H / 2, PAD_W, PAD_H);
    g.fillRect(W - PAD_X - PAD_W, this.pad[1] - PAD_H / 2, PAD_W, PAD_H);

    // ボールは昔のゲームと同じ四角
    if (this.phase === "play" || this.phase === "hold") {
      g.fillRect(this.ball.x - BALL_R, this.ball.y - BALL_R, BALL_R * 2, BALL_R * 2);
    }
  }

  // ---------------------------------------------------------- 入力

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!["w", "s", "arrowup", "arrowdown"].includes(k)) return;
    if (k.startsWith("arrow")) e.preventDefault(); // 画面がスクロールしないように
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
  };

  // マウス・タッチ：動かした位置にパドルを合わせる。
  // 2人で1台のときは、画面の左半分が左の人、右半分が右の人
  private onPointer = (e: PointerEvent) => {
    const r = this.o.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const twoHumans = this.ctl[0].startsWith("keys") && this.ctl[1].startsWith("keys");
    for (const side of [0, 1] as const) {
      if (!this.ctl[side].startsWith("keys")) continue;
      if (!twoHumans || (side === 0 ? x < W / 2 : x >= W / 2)) this.pad[side] = clampPad(y);
    }
  };
}

function clampPad(y: number) {
  return Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, y));
}

// ボールがパドルの面に届くx座標
function planeX(side: 0 | 1) {
  return side === 0 ? PAD_X + PAD_W + BALL_R : W - PAD_X - PAD_W - BALL_R;
}
