// オンライン対戦の通信まわり
//   ・Transport … メッセージの通り道（本番は Ably。?transport=local のときは同じブラウザのタブ同士）
//   ・部屋の作成／参加、おまかせマッチ

export interface Chan {
  publish(data: object): void;
  onMessage(cb: (data: any, from: string) => void): void; // 受け取る関数を差し替える
  close(): void;
}

export interface Transport {
  id: string;
  open(name: string): Promise<Chan>;
  close(): void;
}

export async function connect(kind: "ably" | "local"): Promise<Transport> {
  if (kind === "local") return localTransport();

  const { Realtime } = await loadAbly();
  // APIキーはサーバーだけが持つ。ここでは /api/ably-token で期限つきの許可をもらう
  const rt = new Realtime({ authUrl: "/api/ably-token", echoMessages: false });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 12000);
    rt.connection.once("connected", () => { clearTimeout(timer); resolve(); });
    rt.connection.once("failed", () => { clearTimeout(timer); reject(new Error("failed")); });
  }).catch((e) => { rt.close(); throw e; });

  return {
    id: rt.auth.clientId,
    async open(name) {
      const ch = rt.channels.get("pong:" + name);
      let handler: (d: any, from: string) => void = () => {};
      await ch.subscribe((m) => handler(m.data, m.clientId ?? ""));
      return {
        publish: (d) => { ch.publish("m", d).catch(() => {}); },
        onMessage: (cb) => { handler = cb; },
        close: () => { handler = () => {}; ch.unsubscribe(); ch.detach().catch(() => {}); },
      };
    },
    close: () => rt.close(),
  };
}

// Ablyのブラウザ用ファイル（public/vendor/ably.min.js）を必要になったときだけ読み込む。
// npmのablyをそのままブラウザ向けにビルドすると失敗するため、配布されている完成品を使う
function loadAbly(): Promise<typeof import("ably")> {
  const w = window as unknown as { Ably?: typeof import("ably") };
  if (w.Ably) return Promise.resolve(w.Ably);
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "/vendor/ably.min.js";
    el.onload = () => (w.Ably ? resolve(w.Ably) : reject(new Error("ably")));
    el.onerror = () => reject(new Error("ably"));
    document.head.appendChild(el);
  });
}

// 動作確認用：同じブラウザのタブ同士でつなぐ
function localTransport(): Transport {
  const id = "local-" + Math.random().toString(36).slice(2, 10);
  const opened: BroadcastChannel[] = [];
  return {
    id,
    async open(name) {
      const bc = new BroadcastChannel("pong:" + name);
      opened.push(bc);
      let handler: (d: any, from: string) => void = () => {};
      bc.onmessage = (e) => handler(e.data.d, e.data.from);
      return {
        publish: (d) => { try { bc.postMessage({ d, from: id }); } catch { /* 閉じたあと */ } },
        onMessage: (cb) => { handler = cb; },
        close: () => { handler = () => {}; bc.close(); },
      };
    },
    close: () => opened.forEach((b) => b.close()),
  };
}

export type Session = { chan: Chan; isHost: boolean; room: string };

export const newRoomCode = () => String(Math.floor(1000 + Math.random() * 9000));

// 部屋を作って相手を待つ。戻り値は取り消し用の関数
export async function hostRoom(tp: Transport, room: string, onReady: (s: Session) => void): Promise<() => void> {
  const chan = await tp.open("room-" + room);
  let peer: string | null = null;
  let cancelled = false;
  chan.onMessage((d, from) => {
    if (cancelled || d?.t !== "join") return;
    if (peer === null) {
      peer = from;
      chan.publish({ t: "accept", to: from });
      onReady({ chan, isHost: true, room });
    } else if (from !== peer) {
      chan.publish({ t: "full", to: from });
    }
  });
  return () => {
    cancelled = true;
    if (peer === null) chan.close();
  };
}

// 部屋に入る。満員・見つからないときはエラー
export async function joinRoom(tp: Transport, room: string, waitMs = 4500): Promise<Session> {
  const chan = await tp.open("room-" + room);
  return new Promise<Session>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(retry);
      fn();
    };
    const timer = setTimeout(() => finish(() => { chan.close(); reject(new Error("notfound")); }), waitMs);
    const retry = setTimeout(() => chan.publish({ t: "join" }), 1500);
    chan.onMessage((d) => {
      if (d?.to !== tp.id) return;
      if (d.t === "accept") finish(() => resolve({ chan, isHost: false, room }));
      if (d.t === "full") finish(() => { chan.close(); reject(new Error("full")); });
    });
    chan.publish({ t: "join" });
  });
}

// おまかせマッチ：全員が部屋を作って「待っています」と知らせ合い、
// 番号の大きい部屋の人が、小さい部屋に入りに行く
export async function quickMatch(tp: Transport, onReady: (s: Session) => void): Promise<() => void> {
  const lobby = await tp.open("lobby");
  let stopped = false;
  let joining = false;
  let myRoom = "";
  let cancelHost: (() => void) | null = null;
  let beacon: ReturnType<typeof setInterval> | null = null;

  const done = (s: Session) => {
    if (stopped) { s.chan.close(); return; }
    stopped = true;
    if (beacon) clearInterval(beacon);
    lobby.close();
    onReady(s);
  };

  const startHosting = async () => {
    myRoom = "q" + Math.random().toString(36).slice(2, 10);
    const room = myRoom;
    const cancel = await hostRoom(tp, room, done);
    if (stopped || joining || room !== myRoom) { cancel(); return; }
    cancelHost = cancel;
    const announce = () => { if (!stopped && !joining) lobby.publish({ t: "wait", room }); };
    announce();
    beacon = setInterval(announce, 1500);
  };

  lobby.onMessage(async (d) => {
    if (stopped || joining || d?.t !== "wait" || typeof d.room !== "string" || !myRoom || !(d.room < myRoom)) return;
    joining = true;
    if (beacon) clearInterval(beacon);
    cancelHost?.();
    cancelHost = null;
    try {
      done(await joinRoom(tp, d.room, 3500));
    } catch {
      joining = false;
      if (!stopped) await startHosting();
    }
  });

  await startHosting();

  return () => {
    stopped = true;
    if (beacon) clearInterval(beacon);
    cancelHost?.();
    lobby.close();
  };
}
