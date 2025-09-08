import * as ezo from '../ezo.js';
import * as relay from '../relay.js';
import { State, appendMessage, markRead, saveSettingsToArchive } from '../state.js';
import { esc } from './sanitize/sanitize.js';
import { showInfo, showWarn, showError } from './modals.js';
import { updateStatus } from './status.js';

const $=(id)=>document.getElementById(id);

let pollTimer = null;

export function applyAutoPoll(){
  if (pollTimer) { clearInterval(pollTimer); pollTimer=null; }

function appendNewMessagesToOpenChat(chatId, prevCount){
  try {
    const box = $("chatView");
    if (!box) return;
    const currentChatId = box.getAttribute("data-chat-id");
    if (currentChatId !== chatId) return;
    const msgs = State.chats.get(chatId) || [];
    for (let i = prevCount; i < msgs.length; i++){
      const m = msgs[i];
      const item = document.createElement('div');
      item.className = 'msg' + (m.me ? ' me' : '');
      let rendered = false;
      if (typeof m.text === 'object' && m.text && m.text.file){
        try {
          const { name, size, path } = m.text.file;
          const wrap = document.createElement('div'); wrap.className = 'file-bubble';
          const icon = document.createElement('div'); icon.textContent = '📎';
          const title = document.createElement('div'); title.textContent = name||'file';
          const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${size||0} bytes`;
          wrap.appendChild(icon); wrap.appendChild(title); wrap.appendChild(meta);
          if (path){
            const a = document.createElement('a'); a.textContent='Download'; a.className='button small';
            a.onclick = async (ev)=>{
              ev.preventDefault();
              try {
                const mod = await import('./ezo.js');
                const bytes = await mod.readFileFromArchive(State.PROFILE.ctx, path);
                if (!bytes) return;
                const url = URL.createObjectURL(new Blob([bytes]));
                const dl = document.createElement('a');
                dl.href = url; dl.download = path.split('/').pop(); dl.click();
                setTimeout(()=>URL.revokeObjectURL(url), 2000);
              } catch {}
            };
            wrap.appendChild(a);
          }
          item.appendChild(wrap);
          rendered = true;
        } catch {}
      }
      if (!rendered){
        item.textContent = typeof m.text === 'string' ? m.text : JSON.stringify(m.text);
      }
      const ts = document.createElement('div');
      ts.className = 'ts muted';
      try { const d = new Date(m.ts||Date.now()); ts.textContent = d.toLocaleString(); } catch { ts.textContent = String(m.ts||''); }
      item.appendChild(ts);
      box.appendChild(item);
    }
    box.scrollTop = box.scrollHeight;
  } catch {}
}


  if (State.SETTINGS.autoPoll) {
    pollTimer = setInterval(()=>pollInbox(), Math.min(600000, Math.max(1000, State.SETTINGS.pollMs|0)));
  }
}

function processIncomingMessages(msgs){
  msgs.forEach(async (m)=>{
    try {
      const pkt = { ephPub: ezo.b64d(m.ephPub), iv: ezo.b64d(m.iv), ct: ezo.b64d(m.ct) };
      const pt = await sealedBoxDecryptFrom(State.PROFILE.priv, pkt);
      const typed = ezo.unpackMsg(pt);
      if (!typed) return;

      if (typed.t === "file") {
        const from = (typed.d && typed.d.from) ? String(typed.d.from) : "unknown";
        let chatId = null;
        if (State.friends.has(from)) {
          chatId = from;
        } else {
          // fallback: search by inbox uuid
          for (const [fid, fr] of State.friends.entries()) {
            if (fr && (fr.inbox === from || fr.id === from)) { chatId = fid; break; }
          }
          if (!chatId) chatId = "unk:"+from;
        }
        let relPath = typed.d.relPath;
        try {
          if (typed.d.dataB64) {
            const bytes = ezo.b64d(typed.d.dataB64);
            // place under chat/<from>/files/<fileId>/<name>
            relPath = `chat/${chatId}/files/${typed.d.fileId}/${typed.d.name}`;
            await ezo.writeFileToArchive(State.PROFILE.ctx, relPath, new Uint8Array(bytes));
          }
        } catch {}
        const meta = { type:'file', fileId: typed.d.fileId, name: typed.d.name, size: typed.d.size||0, mime: typed.d.mime||'application/octet-stream', relPath, sha256: typed.d.sha256||'' };
        appendMessage(chatId, JSON.stringify(meta), false);
      } else if (typed.t === "text") {
        const from = (typed.d && typed.d.from) ? String(typed.d.from) : "unknown";
        const body = (typed.d && typed.d.body) ? String(typed.d.body) : "";
        let chatId = null;
        if (State.friends.has(from)) {
          chatId = from;
        } else {
          for (const [fid, fr] of State.friends.entries()) {
            if (fr && (fr.inbox === from || fr.id === from)) { chatId = fid; break; }
          }
          if (!chatId) chatId = "unk:"+from;
        }
        appendMessage(chatId, body, false);
        if (State.friends.has(from)) {
          const fr = State.friends.get(from);
          if (!fr.ack) { fr.ack=true; await ezo.saveFriend(State.PROFILE.ctx, fr); }
        }
      } else if (typed.t === "gmsg") {
        const { gid, ivB64, ctB64 } = typed.d || {};
        if (!gid || !State.groups.has(gid)) return;
        const g = State.groups.get(gid);
        const pt2 = await ezo.groupDecrypt(g, ezo.b64d(ivB64), ezo.b64d(ctB64));
        const obj = JSON.parse(new TextDecoder().decode(pt2));
        appendMessage("g:"+gid, obj.body, false);
      } else if (typed.t === "ginvite") {
        onGroupInvite(typed.d);
      } else if (typed.t === "friend-card" && ezo.isFriendCard(typed.d)) {
        const fc = typed.d;
        if (State.friends.has(fc.id)) {
          const fr = State.friends.get(fc.id);
          if (!fr.mutual) { fr.mutual = true; await ezo.saveFriend(State.PROFILE.ctx, fr); }
        } else {
          const exists = (State.pending.friends||[]).some(c=>c.id===fc.id);
          if (!exists) {
            State.pending.friends = State.pending.friends || [];
            State.pending.friends.push(fc);
          }
        }
      } else if (typed.t === "handshake") {
        const from = (typed.d && typed.d.from) ? String(typed.d.from) : null;
        if (from && State.friends.has(from)) {
          const fr = State.friends.get(from);
          if (!fr.ack) fr.ack = true;
          if (typed.d.hasMyCard && !fr.mutual) fr.mutual = true;
          await ezo.saveFriend(State.PROFILE.ctx, fr);
        }
      }
    } catch {}
  });
  State.__lastPollStr = new Date().toLocaleTimeString();
  try {
    const affected = new Set();
    msgs.forEach((m)=>{
      try {
        const obj = JSON.parse(atob(m.ct||''));
      } catch {}
    });
    const box = $("chatView");
    const openId = box ? box.getAttribute("data-chat-id") : null;
    if (openId && State.chats.has(openId)){
      const prev = parseInt(box.getAttribute("data-rendered-count")||"0", 10);
      appendNewMessagesToOpenChat(openId, prev);
      box.setAttribute("data-rendered-count", String((State.chats.get(openId)||[]).length));
    }
    for (const [cid, count] of State.unread.entries()){
      if (cid === openId) continue;
      const node = document.querySelector(`.chat-item[data-chat-id="${cid}"]`);
      if (node){
        if (count>0) node.classList.add('unread'); else node.classList.remove('unread');
      }
    }
  } catch {}
  updateStatus();
}

export function pollInbox(){
  if (!State.PROFILE) return;
  const to = (State.PROFILE.inboxId||State.PROFILE.name);
  relay.relayGet(to, (msgs)=>processIncomingMessages(msgs));
}

export function pollRelayUrl(url){
  if (!State.PROFILE) return;
  const ws = relay.Relays.sockets.get(url);
  if (!ws || ws.readyState !== 1) { showWarn("Relay not connected", "Connect the relay first."); return; }
  try {
    ws.send(JSON.stringify({ type:"get", to: (State.PROFILE.inboxId||State.PROFILE.name) }));
    const onMsg = async (ev)=>{
      try {
        const m = JSON.parse(ev.data);
        if (m.ok && Array.isArray(m.msgs)) processIncomingMessages(m.msgs);
      } catch {}
      ws.removeEventListener("message", onMsg);
    };
    ws.addEventListener("message", onMsg);
    setTimeout(()=>ws.removeEventListener("message", onMsg), 1500);
  } catch (e) {
    showError("Poll failed", "Could not send poll request to this relay.");
  }
}

/* ----------------------------- Helpers ----------------------------- */
async function sendMyCardTo(friend){
  let avatarSrc = State.PROFILE.avatar;
  if (avatarSrc && !(typeof avatarSrc === 'string')) {
    avatarSrc = await u8ToDataUrl(avatarSrc, 'image/jpeg');
  }
  const card = ezo.makeFriendCard({ id:   (State.PROFILE.inboxId||State.PROFILE.name),
    name: State.PROFILE.name,
    bio:  State.PROFILE.bio||"",
    inbox: (State.PROFILE.inboxId||State.PROFILE.name),
    pubB64: ezo.b64e(State.PROFILE.pub),
    avatar: await normalizeAvatar(avatarSrc) || undefined
  });
  const pkt = await sealedBoxEncryptTo(friend.pubB64, ezo.packMsg("friend-card", card));
  relay.relayPut(friend.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
}
