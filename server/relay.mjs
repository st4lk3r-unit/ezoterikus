// relay.mjs - dumb relay with debug logs & tiny safeguards
import { WebSocketServer } from "ws";

const PORT = process.env.RELAY_PORT ? Number(process.env.RELAY_PORT) : 8787;
const inbox = new Map(); // key -> array of messages
const MAX_INBOX = process.env.RELAY_MAX_INBOX ? Number(process.env.RELAY_MAX_INBOX) : 1000;

let connSeq = 0;
const wss = new WebSocketServer({ port: PORT });
console.log(`[relay] Up on ws://localhost:${PORT}`);

function pushMsg(to, msg) {
  const q = inbox.get(to) ?? [];
  if (q.length >= MAX_INBOX) q.shift(); // drop oldest
  q.push(msg);
  inbox.set(to, q);
}

wss.on("connection", (ws, req) => {
  const id = ++connSeq;
  const ip = req.socket.remoteAddress;
  console.log(`[relay] #${id} connected from ${ip}`);

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch {
      ws.send(JSON.stringify({ ok:false, err:"bad json" }));
      return;
    }

    if (m.type === "put" && typeof m.to === "string" && m.msg) {
      pushMsg(m.to, m.msg);
      const size = inbox.get(m.to)?.length ?? 0;
      console.log(`[relay] #${id} PUT -> "${m.to}" (inbox size=${size})`);
      ws.send(JSON.stringify({ ok:true, queued:size }));
    } else if (m.type === "get" && typeof m.to === "string") {
      const q = inbox.get(m.to) ?? [];
      const out = q.splice(0);
      inbox.set(m.to, q);
      console.log(`[relay] #${id} GET <- "${m.to}" (delivered ${out.length}, remaining ${q.length})`);
      ws.send(JSON.stringify({ ok:true, msgs: out, remaining: q.length }));
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ ok:true, pong:true, time: Date.now() }));
    } else {
      ws.send(JSON.stringify({ ok:false, err:"bad request" }));
    }
  });

  ws.on("close", () => {
    console.log(`[relay] #${id} closed`);
  });
});
