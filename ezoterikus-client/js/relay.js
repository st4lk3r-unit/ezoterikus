export const Relays = { sockets: new Map(), lastPoll: 0 };

export function connectedCount(){ return [...Relays.sockets.values()].filter(ws => ws.readyState === 1).length; }

export function connectRelay(url){
  if (Relays.sockets.has(url)) {
    const ws = Relays.sockets.get(url);
    if (ws.readyState === 1) return Promise.resolve(ws);
  }
  return new Promise((resolve, reject)=>{
    try {
      const ws = new WebSocket(url);
      ws.addEventListener("open", ()=>{ Relays.sockets.set(url, ws); resolve(ws); });
      ws.addEventListener("error", (e)=>{ reject(e); });
      ws.addEventListener("close", ()=>{ /* allow reconnect */ });
    } catch (e) { reject(e); }
  });
}
export function disconnectRelay(url){
  const ws = Relays.sockets.get(url);
  if (ws) { try { ws.close(); } catch {} }
  Relays.sockets.delete(url);
}
export function relayPut(to, msgObj){
  for (const ws of Relays.sockets.values()) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type:"put", to, msg: msgObj }));
  }
}
export function relayGet(to, cb){
  const promises = [];
  for (const [url, ws] of Relays.sockets.entries()) {
    if (ws.readyState !== 1) continue;
    ws.send(JSON.stringify({ type:"get", to }));
    const p = new Promise((resolve)=>{
      const onMsg = (ev)=>{
        try { const m = JSON.parse(ev.data); if (m.ok && m.msgs) resolve(m.msgs); else resolve([]); } catch { resolve([]); }
        ws.removeEventListener("message", onMsg);
      };
      ws.addEventListener("message", onMsg);
      setTimeout(()=>{ ws.removeEventListener("message", onMsg); resolve([]); }, 1500);
    });
    promises.push(p);
  }
  Promise.all(promises).then(all=>{ Relays.lastPoll = Date.now(); cb(all.flat()); });
}
