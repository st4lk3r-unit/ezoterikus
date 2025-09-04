export const State = {
  PROFILE: null,           // { fh, ctx, name, bio, avatar, priv, pub, settings, inboxId }
  SETTINGS: { autoPoll:false, pollMs:5000, relays: [] },
  friends: new Map(),      // id -> friend {id,name,inbox,pubB64,bio,mutual,ack,...}
  groups: new Map(),       // gid -> group {id,name,members[],keys...}
  chats: new Map([["__me__", []]]), // chatId -> [{text,me,ts}]
  unread: new Map(),       // chatId -> count
  pending: { friends: [], groups: [] },
  collapseLeft: false,
  collapseRight: false,
  CURRENT_CHAT: "__me__",
  __lastPollStr: null
};

/* ------------------------ Settings helpers ------------------------ */
export function setProfile(p){ State.PROFILE = p; }
export function setSettings(s){
  const next = {
    autoPoll: !!(s && s.autoPoll),
    pollMs: Math.min(600000, Math.max(1000, (s?.pollMs|0) || 5000)),
    relays: Array.isArray(s?.relays) ? [...new Set(s.relays.filter(Boolean))] : []
  };
  State.SETTINGS = next;
  if (State.PROFILE) State.PROFILE.settings = next;
}

export async function saveSettingsToArchive(){
  if (!State.PROFILE || !State.PROFILE.ctx) return;
  try {
    const mod = await import('./ezo.js');
    const u8 = new TextEncoder().encode(JSON.stringify(State.SETTINGS));
    await mod.writeFileToArchive(State.PROFILE.ctx, 'profile/settings.json', u8);
  } catch (e) {}
}

/* ------------------------ Chat persistence ------------------------ */
async function writeChatIndex(){
  if (!State.PROFILE || !State.PROFILE.ctx) return;
  try {
    const mod = await import('./ezo.js');
    const ids = [...State.chats.keys()].filter(k => k && k !== '__me__');
    const u8 = new TextEncoder().encode(JSON.stringify(ids));
    await mod.writeFileToArchive(State.PROFILE.ctx, 'profile/chat-index.json', u8);
  } catch (e) {}
}

export async function persistChat(chatId){
  if (!State.PROFILE || !State.PROFILE.ctx) return;
  try {
    const mod = await import('./ezo.js');
    const arr = State.chats.get(chatId) || [];
    // Merge with any existing on-disk history to avoid truncation if load didn't run.
    let merged = Array.isArray(arr) ? [...arr] : [];
    try {
      const disk = await mod.readFileFromArchive(State.PROFILE.ctx, `chats/${chatId}.json`);
      if (disk) {
        const diskArr = JSON.parse(new TextDecoder().decode(disk));
        if (Array.isArray(diskArr)) {
          // naive de-dup by (ts,text,me)
          const seen = new Set(diskArr.map(m => `${m.ts}|${m.me?'1':'0'}|${m.text}`));
          for (const m of merged) {
            const key = `${m.ts}|${m.me?'1':'0'}|${m.text}`;
            if (!seen.has(key)) diskArr.push(m);
          }
          merged = diskArr;
        }
      }
    } catch {}
    const u8 = new TextEncoder().encode(JSON.stringify(merged));
    await mod.writeFileToArchive(State.PROFILE.ctx, `chats/${chatId}.json`, u8);
    await writeChatIndex();
  } catch (e) {}
}

export function appendMessage(chatId, text, me=false){
  const arr = State.chats.get(chatId) || [];
  const msg = { text, me, ts: Date.now() };
  arr.push(msg);
  State.chats.set(chatId, arr);
  if (!me && State.CURRENT_CHAT !== chatId) {
    State.unread.set(chatId, (State.unread.get(chatId)||0) + 1);
  }
  // fire-and-forget persist
  persistChat(chatId);
}

export function markRead(chatId){
  State.unread.delete(chatId);
}

export async function loadChatsOnOpen(){
  if (!State.PROFILE || !State.PROFILE.ctx) return;
  try {
    const mod = await import('./ezo.js');
    if (!State.chats.has('__me__')) State.chats.set('__me__', []);
    let idxBuf;
    try {
      idxBuf = await mod.readFileFromArchive(State.PROFILE.ctx, 'profile/chat-index.json');
    } catch (e) {
      const u8 = new TextEncoder().encode(JSON.stringify([]));
      await mod.writeFileToArchive(State.PROFILE.ctx, 'profile/chat-index.json', u8);
      idxBuf = u8;
    }
    if (!idxBuf) return;
    const idx = JSON.parse(new TextDecoder().decode(idxBuf));

    // --- Migration: move legacy name-based chat files to UUID-based (friend inboxId) ---
    try {
      const isUuid = (s)=> typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
      const nameToId = new Map();
      for (const [fid, fr] of State.friends.entries()) {
        if (fr && fr.name) nameToId.set(fr.name, fid);
      }
      if (State.PROFILE?.ctx?.fs?.list) {
        const entries = await State.PROFILE.ctx.fs.list("chats/");
        for (const p of (entries||[])) {
          if (!p.endsWith(".json")) continue;
          const base = p.replace(/^chats\//, "").replace(/\.json$/, "");
          if (!isUuid(base) && nameToId.has(base)) {
            try {
              const targetId = nameToId.get(base);
              const srcBytes = await mod.readFileFromArchive(State.PROFILE.ctx, `chats/${base}.json`);
              const dstPath = `chats/${targetId}.json`;
              let merged = [];
              if (srcBytes) {
                try { merged = JSON.parse(new TextDecoder().decode(srcBytes)) || []; } catch {}
              }
              const dstBytes = await mod.readFileFromArchive(State.PROFILE.ctx, dstPath);
              if (dstBytes) {
                try {
                  const arr = JSON.parse(new TextDecoder().decode(dstBytes));
                  if (Array.isArray(arr)) merged = (Array.isArray(merged)?merged:[]).concat(arr);
                } catch {}
              }
              await mod.writeFileToArchive(State.PROFILE.ctx, dstPath, new TextEncoder().encode(JSON.stringify(merged)));
              try { await State.PROFILE.ctx.fs.del(`chats/${base}.json`); } catch {}
              State.chats.set(targetId, merged);
            } catch(e){}
          }
        }
      }
    } catch (e) { console.warn("chat migration failed", e); }
    // --- End migration ---

    for (const id of Array.isArray(idx)?idx:[]) {
      try {
        const b = await mod.readFileFromArchive(State.PROFILE.ctx, `chats/${id}.json`);
        if (b) {
          const arr = JSON.parse(new TextDecoder().decode(b));
          if (Array.isArray(arr)) State.chats.set(id, arr);
        }
      } catch (e) {}
    }
  
    // Fallback: scan the chats/ directory to recover any files not referenced by chat-index.json
    try {
      const mod = await import('./ezo.js');
      if (State.PROFILE?.ctx?.fs?.list) {
        const entries = await State.PROFILE.ctx.fs.list("chats/");
        const seen = new Set(Array.isArray(idx) ? idx : []);
        for (const p of (entries||[])) {
          if (!p.endsWith(".json")) continue;
          const chatId = p.replace(/^chats\//, "").replace(/\.json$/, "");
          if (!State.chats.has(chatId)) {
            try {
              const b = await mod.readFileFromArchive(State.PROFILE.ctx, `chats/${chatId}.json`);
              if (b) {
                const arr = JSON.parse(new TextDecoder().decode(b));
                if (Array.isArray(arr)) State.chats.set(chatId, arr);
              }
            } catch(e){}
          }
          seen.add(chatId);
        }
        // Re-sync the index if we've discovered new chats
        const currentIdx = JSON.stringify(Array.from(seen));
        const existingIdx = new TextDecoder().decode(idxBuf||new Uint8Array());
        if (currentIdx !== existingIdx) {
          const u8 = new TextEncoder().encode(currentIdx);
          await mod.writeFileToArchive(State.PROFILE.ctx, 'profile/chat-index.json', u8);
        }
      }
    } catch(e){ console.warn('fallback chat scan failed', e); }

} catch (e) { console.warn('loadChatsOnOpen failed', e); }
}
