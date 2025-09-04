// ezo-client/js/ui.js
import { x25519 } from "https://esm.sh/@noble/curves@1.6.0/ed25519";
import * as ezo from './ezo.js';
import * as relay from './relay.js';
import { State, appendMessage, markRead, saveSettingsToArchive } from './state.js';
import { esc } from './ui/sanitize.js';

const $=(id)=>document.getElementById(id);



/* ----------------------------- Avatar normalization ----------------------------- */
async function normalizeAvatar(dataUrl, size=96){
  try {
    if (!dataUrl) return null;
    const img = new Image();
    const loaded = new Promise((res, rej)=>{ img.onload=()=>res(); img.onerror=rej; });
    img.src = dataUrl;
    await loaded;

    const s = size|0;
    const canvas = document.createElement('canvas');
    canvas.width = s; canvas.height = s;
    const ctx = canvas.getContext('2d');

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;
    const scale = Math.max(s/srcW, s/srcH);
    const drawW = Math.ceil(srcW * scale);
    const drawH = Math.ceil(srcH * scale);
    const dx = Math.floor((s - drawW)/2);
    const dy = Math.floor((s - drawH)/2);

    ctx.clearRect(0,0,s,s);
    ctx.drawImage(img, 0,0, srcW,srcH, dx,dy, drawW,drawH);

    let out = canvas.toDataURL('image/png');
    if (out.length > 140000) {
      out = canvas.toDataURL('image/jpeg', 0.85);
    }
    return out;
  } catch(e){
    console.warn('normalizeAvatar failed:', e);
    return null;
  }
}

/* ----------------------------- Binary <-> DataURL helpers ----------------------------- */
function u8ToDataUrl(u8, mime='image/jpeg'){
  return new Promise((resolve)=>{
    try {
      const blob = new Blob([u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)], { type: mime });
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>resolve(null);
      reader.readAsDataURL(blob);
    } catch { resolve(null); }
  });
}

/* ----------------------------- Chat timestamp helpers ----------------------------- */
function getLastMessageTs(chatId){
  try {
    const arr = State.chats.get(chatId);
    if (!arr || !arr.length) return 0;
    // messages are appended; take last element's ts if present
    const last = arr[arr.length-1];
    return (typeof last.ts === 'number') ? last.ts : 0;
  } catch { return 0; }
}

function formatChatTimestamp(ts){
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  const pad = (n)=>String(n).padStart(2,'0');
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // else show YYYY-MM-DD
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/* ----------------------------- Status bar ----------------------------- */
export function updateStatus(){
  const connected = relay.connectedCount();
  const r = $("statusRelays"); if (r) r.textContent = String(connected);
  const a = $("statusAutopoll"); if (a) a.textContent = State.SETTINGS.autoPoll ? "on" : "off";
  const l = $("statusLastPoll"); if (l) l.textContent = State.__lastPollStr || "—";
  const p = $("statusProfile"); if (p) p.textContent = State.PROFILE ? State.PROFILE.name : "none";
  const dot = $("statusDot");
  if (dot) dot.classList.toggle("red", connected === 0); // green by default (CSS)
}

/* ----------------------------- Modal helpers ----------------------------- */
export function showModal(html, mountCb){
  const ov = $("modal"); const box = $("modalBox");
  ov.classList.add("show"); box.innerHTML = html;
  function onClick(e){ if (!box.contains(e.target)) hideModal(); }
  ov.addEventListener("click", onClick, { once:true });
  if (typeof mountCb === "function") mountCb(box);
}
export function hideModal(){ $("modal").classList.remove("show"); $("modalBox").innerHTML=""; }

/* Info / Warning / Error dialogs */
export function showInfo(title, message){
  showModal(`
    <div class="dlg dlg-info">
      <h2>${title||"Info"}</h2>
      <div class="dlg-msg">${message||""}</div>
      <div class="row right"><button id="ok" class="button primary">OK</button></div>
    </div>
  `, (box)=>{ box.querySelector("#ok").onclick = hideModal; });
}
export function showWarn(title, message){
  showModal(`
    <div class="dlg dlg-warn">
      <h2>${title||"Warning"}</h2>
      <div class="dlg-msg">${message||""}</div>
      <div class="row right"><button id="ok" class="button primary">OK</button></div>
    </div>
  `, (box)=>{ box.querySelector("#ok").onclick = hideModal; });
}
export function showError(title, message){
  showModal(`
    <div class="dlg dlg-error">
      <h2>${title||"Error"}</h2>
      <div class="dlg-msg">${message||""}</div>
      <div class="row right"><button id="ok" class="button primary">OK</button></div>
    </div>
  `, (box)=>{ box.querySelector("#ok").onclick = hideModal; });
}
/* Risk confirmation (strong red) */
export async function confirmRisk(message){
  return new Promise((resolve)=>{
    showModal(`
      <div class="dlg dlg-error">
        <h2>Are you sure?</h2>
        <div class="dlg-msg">${message||""}</div>
        <div class="row right">
          <button id="no" class="button">Cancel</button>
          <button id="yes" class="button primary">Yes, proceed</button>
        </div>
      </div>
    `,(box)=>{
      box.querySelector("#no").onclick = ()=>{ hideModal(); resolve(false); };
      box.querySelector("#yes").onclick = ()=>{ hideModal(); resolve(true); };
    });
  });
}

/* ----------------------------- Renderer orchestrator ----------------------------- */
export function renderAll(){
  renderLeft();
  renderCenter();
  renderRight();
  const comp = $("composerBar");
  if (comp) comp.style.display = (State.CURRENT_CHAT==="__me__") ? "none" : "flex";
  const lh = $("leftHandle"), rh = $("rightHandle");
  if (lh) lh.textContent = State.collapseLeft ? "›" : "‹";
  if (rh) rh.textContent = State.collapseRight ? "‹" : "›";
  updateStatus();
}

/* ----------------------------- Left panel ----------------------------- */
export function renderLeft(){
  const app = $("app");
  if (app){
    app.classList.toggle("left-collapsed", State.collapseLeft);
    app.classList.toggle("right-collapsed", State.collapseRight);
  }

  const lh = $("leftHandle"); if (lh) lh.onclick = ()=>{ State.collapseLeft = !State.collapseLeft; renderAll(); };
  const rh = $("rightHandle"); if (rh) rh.onclick = ()=>{ State.collapseRight = !State.collapseRight; renderAll(); };

  const meItem = $("meItem");
  if (meItem){
    const url = (State.PROFILE?.avatar)
      ? URL.createObjectURL(new Blob([State.PROFILE.avatar]))
      : './assets/default-avatar.svg';
    const name = State.PROFILE?.name || 'You';
    const inbox = State.PROFILE?.inboxId || '';
    meItem.innerHTML = `<div class="friend-row">
        <img class="avatar" src="${url}" alt="">
        <div class="names">
          <div class="name">${esc(name)} (you)</div>
          <div class="id muted">${esc(inbox)}</div>
        </div>
      </div>`;
    meItem.classList.toggle("active", State.CURRENT_CHAT==="__me__");
    meItem.onclick = ()=>{ markRead("__me__"); State.CURRENT_CHAT="__me__"; renderAll(); };
  }

  const cg = $("createGroupBtn");
  if (cg) cg.onclick = ()=>{
    if (!State.PROFILE) return;
    showModal(`
      <h2>Create group chat</h2>
      <label>Group name</label>
      <input id="gname" class="input" placeholder="My group">
      <div class="row"><button id="ok" class="button primary">Create</button><button id="cancel" class="button ghost">Cancel</button></div>
    `,(box)=>{
      box.querySelector("#cancel").onclick = hideModal;
      box.querySelector("#ok").onclick = async ()=>{
        const name = box.querySelector("#gname").value.trim();
        if (!name) return;
        const g = await ezo.createGroup(State.PROFILE.ctx, name);
        State.groups.set(g.id, g); State.chats.set("g:"+g.id, []);
        State.CURRENT_CHAT="g:"+g.id; hideModal(); renderAll();
      };
    });
  };

  // Friends
  const chatsMount = $("chatsMount"); if (chatsMount) {
    chatsMount.innerHTML="";
    const items = [];
    for (const [id, fr] of State.friends.entries()) {
      items.push({ id, fr, ts: getLastMessageTs(id) });
    }
    items.sort((a,b)=> (b.ts|0) - (a.ts|0));
    for (const {id, fr, ts} of items) {
      const div = document.createElement("div");
      div.className = "chat-item" + (State.CURRENT_CHAT===id?" active":"");
      div.dataset.chatId = id;
      if (State.unread.get(id)>0) div.classList.add("unread");
      if (!fr.mutual || !fr.ack) div.classList.add("grey");
      const avatarUrl = (fr && fr.avatar) ? fr.avatar : './assets/default-avatar.svg';
      const when = formatChatTimestamp(ts);
      div.innerHTML = `<div class="friend-row" style="display:flex; align-items:center; gap:10px; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <img class="avatar" src="${avatarUrl}" alt="">
          <div class="names" style="min-width:0;">
            <div class="name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(fr?.name||id)}</div>
            <div class="id muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(id)}</div>
          </div>
        </div>
        <div class="muted" style="margin-left:8px; white-space:nowrap;">${when}</div>
      </div>`;
      div.onclick = ()=>{ markRead(id); State.CURRENT_CHAT=id; renderAll(); };
      chatsMount.appendChild(div);
    }
  }
// Unknown
  const unknownMount = $("unknownMount"); if (unknownMount){
    unknownMount.innerHTML="";
    for (const id of State.chats.keys()) {
      if (id==="__me__") continue;
      if (id.startsWith("g:")) continue;
      if (State.friends.has(id)) continue;
      // treat any DM id not in friends as unknown (also supports legacy 'unk:' ids)
      const d=document.createElement("div");
      d.className="chat-item"+(State.CURRENT_CHAT===id?" active":"");
      if (State.unread.get(id)>0) d.classList.add("unread");
      const label = id.startsWith("unk:") ? ("Unknown #"+id.slice(4)) : ("Unknown #"+id);
      d.textContent=label;
      d.onclick=()=>{ markRead(id); State.CURRENT_CHAT=id; renderAll(); };
      unknownMount.appendChild(d);
    }
  }


}
/* ----------------------------- Center panel ----------------------------- */
export function renderCenter(){
  const box = $("chatView");
  if (!box) return;
  box.innerHTML = "";
  box.removeAttribute('data-chat-id');
  box.removeAttribute('data-rendered-count');

  if (!State.PROFILE) {
    box.innerHTML = "<div class='msg'>Not signed in yet.</div>";
    return;
  }

  if (State.CURRENT_CHAT === "__me__") {
    const url = State.PROFILE?.avatar ? URL.createObjectURL(new Blob([State.PROFILE.avatar])) : "";
    const sec = document.createElement("div");
    sec.className = "profile-view";
    sec.innerHTML = `
      <div class="chat-section-title">Your profile</div>
      <div class="row" style="align-items:center;">
        <img class="avatar" id="avatarImg" ${url?`src="${url}"`:""}>
        <label class="file-btn"><input type="file" id="avatarFile" accept="image/*"><span class="button small">Choose avatar</span></label>
        <button id="saveAvatar" class="button small">Save</button>
      </div>

      <div class="row" style="margin-top:8px;">
        <div style="flex:1;">
          <div class="chat-section-title">Display name</div>
          <input id="nameEdit" class="input" value="${State.PROFILE?.name||""}">
        </div>
        <div style="flex:1;">
          <div class="chat-section-title">Bio</div>
          <input id="bioEdit" class="input" value="${State.PROFILE?.bio||""}">
        </div>
      </div>

      <div class="row" style="margin-top:8px;">
        <button id="saveProfile" class="button primary" style="flex:1;">Save profile</button>
        <button id="btnMakeCard" class="button" style="flex:1;">Generate friend card (.ezocard)</button>
        <button id="btnExportProfile" class="button" style="flex:1;">Export profile (.ezo)</button>
      </div>

      <div class="row" style="margin-top:8px;">
        <button id="btnChangePass" class="button" style="flex:1;">Change password (re‑encrypt)</button>
      </div>

      <div class="chat-section-title" style="margin-top:12px;">Settings</div>
      <div class="msg-full">
        <div class="row" style="align-items:center;">
          <div style="flex:1;">
            <label>Auto-poll</label>
            <select id="autoPoll" class="select" style="margin-top:4px;">
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </div>
          <div style="flex:1;">
            <label>Poll interval</label>
            <select id="pollMs" class="select" style="margin-top:4px;">
              <option value="1000">1s</option>
              <option value="3000">3s</option>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="30000">30s</option>
              <option value="60000">1m</option>
              <option value="180000">3m</option>
              <option value="300000">5m</option>
              <option value="600000">10m</option>
            </select>
          </div>
        </div>

        <div class="chat-section-title" style="margin-top:10px;">Relays</div>
        <div id="relayList"></div>
        <div class="row" style="margin-top:6px;">
          <input id="relayUrlAdd" class="input" placeholder="ws://localhost:8787">
          <button id="relayAdd" class="button">Add relay</button>
        </div>

        <div class="row" style="margin-top:10px; justify-content:flex-end;">
          <button id="saveSettings" class="button primary">Save settings</button>
        </div>
      </div>

      <div class="chat-section-title" style="margin-top:12px;">Archive manager</div>
      <div class="msg-full">
        <div id="archList" class="arch-list muted">Loading…</div>
        <div class="row" style="margin-top:8px;">
          <input id="archNewPath" class="input" placeholder="path/to/new.txt" style="flex:1;">
          <button id="archCreate" class="button">Create empty</button>
        </div>
      </div>
      <div class="chat-section-title" style="margin-top:12px;">Pending invitations</div>
      <div id="pendingInv"></div>

      <div class="chat-section-title" style="margin-top:12px;">Keys</div>
      <div class="msg-full">Inbox (UUID): <code>${State.PROFILE?.inboxId||""}</code></div>
      <div class="msg-full">Public key (base64): <code style="word-break:break-all;">${State.PROFILE ? ezo.b64e(State.PROFILE.pub):""}</code></div>
    `;
    box.appendChild(sec);

    /* ---- Profile fields ---- */
    sec.querySelector("#saveProfile").onclick = async ()=>{
      const newName = sec.querySelector("#nameEdit").value.trim();
      const newBio  = sec.querySelector("#bioEdit").value.trim();
      await ezo.saveProfileFields(State.PROFILE.ctx, { name:newName, bio:newBio });
      State.PROFILE.name = newName;
      State.PROFILE.bio  = newBio;
      renderAll();
      showInfo("Saved", "Profile updated.");
    };

    // Change password flow
    const btnCp = sec.querySelector('#btnChangePass');
    if (btnCp) btnCp.onclick = ()=>{
      showModal(`
        <div class='chat-section-title'>Change password</div>
        <div class='row'>
          <div style='flex:1;'>
            <label>Current password</label>
            <input id='cpOld' type='password' class='input'>
          </div>
        </div>
        <div class='row'>
          <div style='flex:1;'>
            <label>New password</label>
            <input id='cpNew1' type='password' class='input'>
          </div>
          <div style='flex:1;'>
            <label>Confirm</label>
            <input id='cpNew2' type='password' class='input'>
          </div>
        </div>
        <div class='row' style='margin-top:8px;'>
          <button id='cpDo' class='button primary' style='flex:1;'>Change</button>
          <button id='cpCancel' class='button' style='flex:1;'>Cancel</button>
        </div>
      `, (box)=>{
        box.querySelector('#cpCancel').onclick = hideModal;
        box.querySelector('#cpDo').onclick = async ()=>{
          const oldP = (box.querySelector('#cpOld')?.value||'');
          const n1 = (box.querySelector('#cpNew1')?.value||'');
          const n2 = (box.querySelector('#cpNew2')?.value||'');
          if (!oldP || !n1 || n1!==n2) { showWarn('Mismatch', 'Please fill fields and confirm new password.'); return; }
          try {
            await ezo.changeArchivePassword(State.PROFILE.ctx, oldP, n1);
            hideModal(); showInfo('Password updated', 'Archive re-encrypted with Argon2id.');
          } catch(e) {
            console.error(e);
            showError('Failed', 'Could not change password.');
          }
        };
      });
    };
    sec.querySelector("#btnMakeCard").onclick = async ()=>{
      let avatarSrc = State.PROFILE.avatar;
      if (avatarSrc && !(typeof avatarSrc === 'string')) {
        avatarSrc = await u8ToDataUrl(avatarSrc, 'image/jpeg');
      }
      const card = ezo.makeFriendCard({ id:   (State.PROFILE.inboxId||State.PROFILE.name),
        name: State.PROFILE.name,
        bio:  State.PROFILE.bio || "",
        inbox: (State.PROFILE.inboxId||State.PROFILE.name),
        pubB64: ezo.b64e(State.PROFILE.pub),
        avatar: await normalizeAvatar(avatarSrc) || undefined
      });
      ezo.downloadFriendCard(card, `${State.PROFILE.name}.ezocard.json`);
      showInfo("Card generated", "Your friend card download has started.");
    };
    sec.querySelector("#btnExportProfile").onclick = async ()=>{
      const ok = await confirmRisk("Exporting your profile archive (.ezo) makes it easy to copy your encrypted profile to other devices. Keep it secure.");
      if (!ok) return;
      ezo.downloadArchive(State.PROFILE.fh, `${State.PROFILE.name}.ezo`);
      showInfo("Exported", "The profile archive download has started.");
    };
    sec.querySelector("#saveAvatar").onclick = async ()=>{
      const file = sec.querySelector("#avatarFile").files?.[0];
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await ezo.saveProfileFields(State.PROFILE.ctx, { avatarBytes: bytes });
      State.PROFILE.avatar = bytes;
      renderCenter();
      showInfo("Saved", "Avatar updated.");
    };

    /* ---- Settings init + autosave on change ---- */
    const autoSel = sec.querySelector("#autoPoll");
    const pollSel = sec.querySelector("#pollMs");
    autoSel.value = State.SETTINGS.autoPoll ? "on" : "off";
    pollSel.value = String(Math.min(600000, Math.max(1000, State.SETTINGS.pollMs|0)));
    autoSel.onchange = async ()=>{
      if (autoSel.value === "on" && !State.SETTINGS.autoPoll) {
        const ok = await confirmRisk("Auto-poll will periodically contact relays to fetch messages. This may leave network traces.");
        if (!ok) { autoSel.value = "off"; return; }
      }
      State.SETTINGS.autoPoll = (autoSel.value === "on");
      await saveSettingsToArchive();
      applyAutoPoll();
      updateStatus();
      showInfo("Saved", "Auto-poll preference updated.");
    };
    pollSel.onchange = async ()=>{
      State.SETTINGS.pollMs = parseInt(pollSel.value, 10);
      await saveSettingsToArchive();
      applyAutoPoll();
      showInfo("Saved", "Poll interval updated.");
    };

    /* ---- Relays list ---- */
    function renderRelayListLocal(){
      const mount = sec.querySelector("#relayList");
      mount.innerHTML = "";
      if (!State.SETTINGS.relays || State.SETTINGS.relays.length === 0) {
        const d = document.createElement("div");
        d.className = "muted";
        d.textContent = "No relays configured.";
        mount.appendChild(d);
        return;
      }
      State.SETTINGS.relays.forEach(url=>{
        const row = document.createElement("div");
        row.className = "row";
        row.style.alignItems = "center";
        row.innerHTML = `
          <input class="input" value="${url}" disabled style="flex:1;">
          <button class="button small" id="conn">Connect</button>
          <button class="button small" id="disc">Disconnect</button>
          <button class="button small" id="poll">Poll</button>
          <button class="button small" id="rem">Remove</button>
        `;
        const conn = row.querySelector("#conn");
        const disc = row.querySelector("#disc");
        const poll = row.querySelector("#poll");
        const rem  = row.querySelector("#rem");

        conn.onclick = async ()=>{
          try { await relay.connectRelay(url); updateStatus(); showInfo("Connected", `Connected to relay <code>${url}</code>.`); }
          catch { showError("Connect failed", "Could not connect to the relay."); }
        };
        disc.onclick = ()=>{
          relay.disconnectRelay(url);
          updateStatus();
          showWarn("Disconnected", `Disconnected from relay <code>${url}</code>.`);
        };
        poll.onclick = ()=>{
          pollRelayUrl(url);
        };
        rem.onclick = async ()=>{
          State.SETTINGS.relays = State.SETTINGS.relays.filter(u => u !== url);
          await saveSettingsToArchive();
          renderRelayListLocal();
          updateStatus();
          showInfo("Removed", "Relay removed from your settings.");
        };

        mount.appendChild(row);
      });
    }
    renderRelayListLocal();

    sec.querySelector("#relayAdd").onclick = async ()=>{
      const url = sec.querySelector("#relayUrlAdd").value.trim();
      if (!url) { showWarn("No URL", "Enter a relay WebSocket URL first."); return; }
      if (!State.SETTINGS.relays.includes(url)) State.SETTINGS.relays.push(url);
      await saveSettingsToArchive();
      sec.querySelector("#relayUrlAdd").value = "";
      renderRelayListLocal();
      showInfo("Added", "Relay saved to your settings.");
    };

    /* ---- Explicit save button ---- */
    const saveBtn = sec.querySelector("#saveSettings");
    if (saveBtn) {
      saveBtn.onclick = async ()=>{
        State.SETTINGS.autoPoll = (autoSel.value === "on");
        State.SETTINGS.pollMs   = parseInt(pollSel.value, 10);
        await saveSettingsToArchive();
        applyAutoPoll();
        updateStatus();
        showInfo("Saved", "Settings saved.");
      };
    }

    
    /* ---- Archive Manager ---- */
    async function renderArchiveList(){
      const mount = sec.querySelector("#archList");
      try {
        const files = (await State.PROFILE.ctx.fs.list()) || [];
        if (!files.length) { mount.textContent = "Archive is empty."; return; }
        const container = document.createElement('div');
        for (const p of files.sort()) {
          const row = document.createElement('div');
          row.className = 'row arch-row';
          const name = document.createElement('div'); name.textContent = p; name.style.flex='1';
          const dl = document.createElement('button'); dl.className='button small'; dl.textContent='Download';
          dl.onclick = async ()=>{
            try {
              const bytes = await State.PROFILE.ctx.fs.get(p);
              if (!bytes) return;
              const blob = new Blob([new Uint8Array(bytes)], { type:'application/octet-stream' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href=url; a.download=p.split('/').pop()||'file.bin';
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(()=>URL.revokeObjectURL(url), 1000);
            } catch(e) {}
          };
          const rm = document.createElement('button'); rm.className='button small'; rm.textContent='Delete';
          rm.onclick = async ()=>{ await State.PROFILE.ctx.fs.del(p); await renderArchiveList(); };
          row.appendChild(name); row.appendChild(dl); row.appendChild(rm);
          container.appendChild(row);
        }
        mount.classList.remove('muted');
        mount.innerHTML = ""; mount.appendChild(container);
      } catch (e) {
        mount.textContent = "Cannot list files (upgrade needed).";
      }
    }
    renderArchiveList();
    const archCreateBtn = sec.querySelector("#archCreate");
    archCreateBtn.onclick = async ()=>{
      const p = sec.querySelector("#archNewPath").value.trim();
      if (!p) return;
      await State.PROFILE.ctx.fs.put(p, new Uint8Array([]));
      await renderArchiveList();
    };
/* ---- Pending invitations (friends + groups) ---- */
    const pendingDiv = sec.querySelector("#pendingInv");
    pendingDiv.innerHTML = "";

    // Friends
    if (!State.pending.friends || State.pending.friends.length === 0) {
      const none = document.createElement("div");
      none.className = "muted";
      none.textContent = "No pending friend requests.";
      pendingDiv.appendChild(none);
    } else {
      State.pending.friends.forEach((card, idx)=>{
        const row = document.createElement("div");
        row.className = "msg-full";
        row.innerHTML = `
          <b>Friend request from ${card.name || card.id}</b> <span class="pill">${card.id}</span>
          <div class="muted">${card.bio || ""}</div>
          <div class="row" style="margin-top:6px;">
            <button class="button small" id="accF_${idx}">Accept</button>
            <button class="button small" id="accFSend_${idx}">Accept & Send my card</button>
            <button class="button small" id="decF_${idx}">Decline</button>
          </div>
        `;
        pendingDiv.appendChild(row);

        const accept = async (sendMine)=>{
          const fr = {
            id: card.id,
            name: card.name || card.id,
            inbox: card.inbox || card.id,
            pubB64: card.pubB64,
            bio: card.bio || "",
            createdAt: Date.now(),
            mutual: sendMine ? true : false,
            ack: false,
            avatar: card.avatar ? await normalizeAvatar(card.avatar) : undefined
          };
          await ezo.saveFriend(State.PROFILE.ctx, fr);
          State.friends.set(fr.id, fr);

          if (sendMine) {
            const ok2 = await confirmRisk("Sending your card back over a relay reveals your inbox and public key to that recipient.");
            if (ok2) {
              await sendMyCardTo(fr);
              await sendHandshake(fr, /*hasMyCard*/ true);
            }
          } else {
            await sendHandshake(fr, /*hasMyCard*/ false);
          }

          State.pending.friends.splice(idx,1);
          renderAll();
        };

        row.querySelector("#accF_"+idx).onclick = ()=>accept(false);
        row.querySelector("#accFSend_"+idx).onclick = ()=>accept(true);
        row.querySelector("#decF_"+idx).onclick = ()=>{
          State.pending.friends.splice(idx,1);
          renderAll();
        };
      });
    }

    // Separator
    const sep = document.createElement("div");
    sep.className = "h";
    sep.style.marginTop = "8px";
    sep.textContent = "Group invitations";
    pendingDiv.appendChild(sep);

    // Groups
    if (!State.pending.groups || State.pending.groups.length===0) {
      const d = document.createElement("div");
      d.className = "muted";
      d.textContent = "No pending group invitations.";
      pendingDiv.appendChild(d);
    } else {
      State.pending.groups.forEach((pinv, idx)=>{
        const row = document.createElement("div");
        row.className = "msg-full";
        row.innerHTML = `
          <b>${pinv.group.name}</b> <span class="pill">${pinv.group.id}</span>
          <div class="muted">Members: ${(pinv.group.members||[]).map(m=>m.name||m.id).join(", ")}</div>
          <div class="row" style="margin-top:6px;">
            <button class="button small" id="accG_${idx}">Accept</button>
            <button class="button small" id="decG_${idx}">Decline</button>
          </div>
        `;
        pendingDiv.appendChild(row);

        row.querySelector("#accG_"+idx).onclick = async ()=>{
          const g = pinv.group;
          await ezo.saveGroup(State.PROFILE.ctx, g);
          State.groups.set(g.id, g);
          State.chats.set("g:"+g.id, State.chats.get("g:"+g.id) || []);
          State.pending.groups.splice(idx, 1);
          renderAll();
        };
        row.querySelector("#decG_"+idx).onclick = ()=>{
          State.pending.groups.splice(idx, 1);
          renderAll();
        };
      });
    }

    return;
  }

  const msgs = State.chats.get(State.CURRENT_CHAT) || [];
  for (const m of msgs) {
    const item = document.createElement("div");
    item.className = "msg" + (m.me ? " me" : "");
    let rendered = false;
    try {
      const obj = JSON.parse(m.text);
      if (obj && obj.type === 'file' && obj.name && obj.relPath) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = obj.name;
        a.title = `${obj.name} • ${obj.size||0} bytes`;
        a.onclick = async (ev)=>{
          ev.preventDefault();
          try {
            const bytes = await ezo.readFileFromArchive(State.PROFILE.ctx, obj.relPath);
            if (!bytes) return;
            const blob = new Blob([new Uint8Array(bytes)], { type: obj.mime||'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const dl = document.createElement('a');
            dl.href = url; dl.download = obj.name;
            document.body.appendChild(dl); dl.click(); dl.remove();
            setTimeout(()=>URL.revokeObjectURL(url), 5000);
          } catch {}
        };
        const wrap = document.createElement('div');
        wrap.className = 'file-bubble';
        wrap.appendChild(a);
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = obj.sha256 ? ` • sha256:${obj.sha256.slice(0,8)}…` : '';
        wrap.appendChild(meta);
        item.appendChild(wrap);
        rendered = true;
      }
    } catch {}
    if (!rendered) { item.textContent = m.text; }
    const ts = document.createElement('div');
    ts.className = 'ts muted';
    try { const d = new Date(m.ts||Date.now()); ts.textContent = d.toLocaleString(); }
    catch { ts.textContent = String(m.ts||''); }
    item.appendChild(ts);
    box.appendChild(item);
  }
  box.setAttribute('data-chat-id', State.CURRENT_CHAT);
  box.setAttribute('data-rendered-count', String((State.chats.get(State.CURRENT_CHAT)||[]).length));
  box.scrollTop = box.scrollHeight;
}

/* ----------------------------- Right panel ----------------------------- */
export function renderRight(){
  const rc = $("rightContent"); if (!rc) return;
  rc.innerHTML="";
  if (!State.PROFILE) { rc.innerHTML="<div class='msg'>Open a profile first.</div>"; return; }

  if (State.CURRENT_CHAT==="__me__") {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="chat-section-title">Friends</div>
      <div id="friendsList"></div>
      <div class="row" style="margin-top:12px;">
        <label class="file-btn" style="flex:1;">
          <input type="file" id="card" accept=".json,.ezocard">
          <span class="button">Import friend card</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="sendBack"> <span class="muted">send my card back now</span>
        </label>
      </div>
    `;
    rc.appendChild(container);
    const fl = container.querySelector("#friendsList"); fl.innerHTML="";
    for (const fr of State.friends.values()) {
      const row = document.createElement("div");
      row.className = "msg-full"; row.style.cursor="pointer";
      row.innerHTML = `<b>${esc(fr.name)}</b> <span class='pill'>${fr.inbox}</span>
                       <div class="muted">${fr.bio||""}${(!fr.mutual||!fr.ack) ? " — awaiting handshake" : ""}</div>`;
      row.onclick = ()=>{ State.CURRENT_CHAT = fr.id; renderAll(); };
      fl.appendChild(row);
    }

    container.querySelector("#card").onchange = async (ev)=>{
      const ok = await confirmRisk("Importing a friend card received over a network may be less secure than a physical exchange.");
      if (!ok) { ev.target.value=""; return; }
      const f = ev.target.files?.[0]; if (!f) return;
      try {
        const card = await ezo.readFriendCardFromFile(f);
        State.pending.friends = (State.pending.friends||[]).filter(c=>c.id!==card.id);

const fr = {
  id: card.id,
  name: card.name || card.id,
  inbox: card.inbox || card.id,
  pubB64: card.pubB64,
  bio: card.bio || "",
  createdAt: Date.now(),
  mutual: false,
  ack: false,
  avatar: card.avatar ? await normalizeAvatar(card.avatar) : undefined
};
        await ezo.saveFriend(State.PROFILE.ctx, fr); State.friends.set(fr.id, fr);

        const unkId = "unk:"+fr.id;
        if (State.chats.has(unkId)) {
          const history = State.chats.get(unkId); State.chats.delete(unkId);
          const dest = State.chats.get(fr.id) || []; State.chats.set(fr.id, dest.concat(history));
          if (State.CURRENT_CHAT===unkId) State.CURRENT_CHAT = fr.id;
        }

        const doSendBack = container.querySelector("#sendBack").checked;
        if (doSendBack) {
          const ok2 = await confirmRisk("Sending your card back over a relay reveals your inbox and public key to that recipient.");
          if (ok2) {
            await sendMyCardTo(fr);
            fr.mutual = true; // assume they'll store it; final confirmation via handshake
            await ezo.saveFriend(State.PROFILE.ctx, fr);
          }
        }

        await sendHandshake(fr, /*hasMyCard*/ doSendBack);
        renderAll();
      } catch (e) { showError("Invalid card", "The selected file is not a valid friend card."); }
    };
    return;
  }

  if (State.CURRENT_CHAT.startsWith("g:")) {
    const gid = State.CURRENT_CHAT.slice(2);
    const g = State.groups.get(gid);
    if (!g) { rc.innerHTML = "<div class='msg'>Group not found.</div>"; return; }
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="chat-section-title">Group: ${g.name}</div>
      <div class="muted">Group ID: ${g.id}</div>
      <div class="chat-section-title">Members</div>
      <div id="gmembers"></div>
      <div style="margin-top:8px;"><button id="addMemberBtn" class="button">Add member</button></div>
    `;
    rc.appendChild(wrap);
    const gm = wrap.querySelector("#gmembers"); gm.innerHTML="";
    for (const m of g.members) {
      const div = document.createElement("div"); div.className="msg-full";
      div.innerHTML = `<b>${m.name}</b> <span class='pill'>${m.id}</span>`; gm.appendChild(div);
    }
    wrap.querySelector("#addMemberBtn").onclick = ()=>{
      const ids = [...State.friends.keys()];
      if (ids.length===0) return showWarn("No friends", "You have no friends to add.");
      showModal(`
        <h2>Add members to ${g.name}</h2>
        <div class="listbox" id="pickList"></div>
        <div class="row"><button id="ok" class="button primary">Add</button><button id="cancel" class="button ghost">Cancel</button></div>
      `,(box)=>{
        const pickList = box.querySelector("#pickList");
        ids.forEach(id=>{
          const fr = State.friends.get(id);
          const item = document.createElement("label");
          item.className = "item";
          item.innerHTML = `<input type="checkbox" value="${id}"><b>${esc(fr.name)}</b> <span class="pill">${fr.id}</span>`;
          pickList.appendChild(item);
        });
        box.querySelector("#cancel").onclick = hideModal;
        box.querySelector("#ok").onclick = async ()=>{
          const chosen = [...pickList.querySelectorAll("input[type=checkbox]:checked")].map(x=>x.value);
          for (const id of chosen) {
            const fr = State.friends.get(id);
            if (!g.members.find(x=>x.id===fr.id)) {
              g.members.push({ id: fr.id, name: fr.name, inbox: fr.inbox, pubB64: fr.pubB64 });
              await ezo.saveGroup(State.PROFILE.ctx, g); State.groups.set(g.id, g);
              await sendGroupInvite(g, fr);
            }
          }
          hideModal(); renderRight();
          showInfo("Invited", "Invitation(s) sent.");
        };
      });
    };
    return;
  }

  if (State.CURRENT_CHAT.startsWith("unk:")) {
    const senderId = State.CURRENT_CHAT.slice(4);
    const info = document.createElement("div");
    info.innerHTML = `
      <div class="chat-section-title">Unknown sender</div>
      <div class="msg">ID seen in message: <b>${esc(senderId)}</b></div>
      <div class="muted">To add them as a friend, import their card (.ezocard) from your You page.</div>
      <div class="row" style="margin-top:8px;">
        <button id="sendMyCard" class="button">Send my card</button>
        <button id="deleteThread" class="button">Delete thread</button>
      </div>
    `;
    rc.appendChild(info);
    info.querySelector("#deleteThread").onclick = ()=>{ State.chats.delete("unk:"+senderId); State.CURRENT_CHAT="__me__"; renderAll(); showInfo("Deleted", "Unknown conversation removed."); };
    info.querySelector("#sendMyCard").onclick = async ()=>{
      const ok = await confirmRisk("Sending your card to an unknown sender reveals your inbox and public key to that party.");
      if (!ok) return;
      const pending = (State.pending.friends||[]).find(c=>c.id===senderId);
      const fr = State.friends.get(senderId);
      if (fr) {
        await sendMyCardTo(fr);
        await sendHandshake(fr, /*hasMyCard*/ true);
        fr.mutual = true; await ezo.saveFriend(State.PROFILE.ctx, fr);
        showInfo("Card sent", "Your card was sent to this contact.");
      } else if (pending) {
        const newFr = {
          id: pending.id, name: pending.name||pending.id, inbox: pending.inbox||pending.id,
          pubB64: pending.pubB64, bio: pending.bio||"", createdAt: Date.now(), mutual:true, ack:false
        };
        await ezo.saveFriend(State.PROFILE.ctx, newFr); State.friends.set(newFr.id, newFr);
        State.pending.friends = State.pending.friends.filter(c=>c.id!==pending.id);
        await sendMyCardTo(newFr);
        await sendHandshake(newFr, /*hasMyCard*/ true);
        const unkId = "unk:"+newFr.id;
        if (State.chats.has(unkId)) {
          const history = State.chats.get(unkId); State.chats.delete(unkId);
          const dest = State.chats.get(newFr.id) || []; State.chats.set(newFr.id, dest.concat(history));
          if (State.CURRENT_CHAT===unkId) State.CURRENT_CHAT = newFr.id;
        }
        renderAll();
        showInfo("Card sent", "Your card was sent and the thread was upgraded to a friend chat.");
      } else {
        showWarn("Missing their card", "You don't have their public key yet. Ask them to send their friend card first.");
      }
    };
    return;
  }

  // Friend info view
  const fr = State.friends.get(State.CURRENT_CHAT);
  if (!fr) { rc.innerHTML="<div class='msg'>Friend not found.</div>"; return; }
  const info = document.createElement("div");
  const pendingHandshake = (!fr.mutual || !fr.ack);
  info.innerHTML = `
    <div class="chat-section-title">Talking to</div>
    <div class="msg"><b>${esc(fr.name)}</b> ${pendingHandshake?'<span class="pill">handshake pending</span>':''}</div>
    <div class="msg">Inbox: <code>${esc(fr.inbox)}</code></div>
    <div class="msg">Public key: <code style="word-break:break-all;">${esc(fr.pubB64)}</code></div>
    <div class="row" style="gap:8px;">
      <button id="deleteFriendBtn" class="button" style="flex:1;">Delete friend</button>
      <button id="inviteToGroupBtn" class="button" style="flex:1;">Invite to group</button>
      ${pendingHandshake ? '<button id="sendCardBtn" class="button" style="flex:1;">Send my card</button>' : ''}
    </div>
  `;
  rc.appendChild(info);
  info.querySelector("#deleteFriendBtn").onclick = async ()=>{
    const ok = await confirmRisk("This will remove the friend locally. Messages remain in your archive.");
    if (!ok) return;
    await ezo.markFriendDeleted(State.PROFILE.ctx, fr.id);
    State.friends.delete(fr.id); State.chats.delete(fr.id);
    if (State.CURRENT_CHAT===fr.id) State.CURRENT_CHAT="__me__";
    renderAll();
    showInfo("Removed", "Friend deleted.");
  };
  info.querySelector("#inviteToGroupBtn").onclick = ()=>{
    const gids = [...State.groups.keys()];
    if (gids.length===0) { showWarn("No groups", "Create a group first."); return; }
    showModal(`
      <h2>Invite ${fr.name} to group</h2>
      <label>Pick a group</label>
      <select id="gsel" class="select"></select>
      <div class="row"><button id="ok" class="button primary">Invite</button><button id="cancel" class="button ghost">Cancel</button></div>
    `,(box)=>{
      const sel = box.querySelector("#gsel"); gids.forEach(id=>{ const o=document.createElement("option"); o.value=id; o.textContent=State.groups.get(id).name; sel.appendChild(o); });
      box.querySelector("#cancel").onclick = hideModal;
      box.querySelector("#ok").onclick = async ()=>{
        const chosen = sel.value; if (!chosen || !State.groups.has(chosen)) return;
        const g = State.groups.get(chosen);
        if (!g.members.find(x=>x.id===fr.id)) {
          g.members.push({ id: fr.id, name: fr.name, inbox: fr.inbox, pubB64: fr.pubB64 });
          await ezo.saveGroup(State.PROFILE.ctx, g); State.groups.set(g.id, g);
          await sendGroupInvite(g, fr);
        }
        hideModal(); showInfo("Invited", `${fr.name} invited to ${g.name}.`);
      };
    });
  };
  const sendCardBtn = info.querySelector("#sendCardBtn");
  if (sendCardBtn) {
    sendCardBtn.onclick = async ()=>{
      const ok = await confirmRisk("Sending your card reveals your inbox and public key to that recipient.");
      if (!ok) return;
      await sendMyCardTo(fr);
      await sendHandshake(fr, /*hasMyCard*/ true);
      fr.mutual = true; await ezo.saveFriend(State.PROFILE.ctx, fr);
      renderRight();
      showInfo("Card sent", "Your card was sent to this contact.");
    };
  }
}


export async function sendFileMeta(meta){
  if (!State.PROFILE) return;
  const chatId = State.CURRENT_CHAT;
  const text = JSON.stringify(meta);
  if (!chatId.startsWith("g:") && chatId !== "__me__") {
    const fr = State.friends.get(chatId);
    if (fr && fr.pubB64) {
      const pkt = await sealedBoxEncryptTo(fr.pubB64, ezo.packMsg("file", meta));
      relay.relayPut(fr.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
    }
  }
}
/* ----------------------------- Send / Crypto ----------------------------- */
export async function sendNow(){
  if (relay.connectedCount()===0) { showWarn("No relay connected", "Connect at least one relay in Settings."); return; }
  if (!State.PROFILE) return;
  const inp = $("composerInput");
  const text = inp.value.trim(); if (!text) return;

  // Group chat
  if (State.CURRENT_CHAT.startsWith("g:")) {
    const gid = State.CURRENT_CHAT.slice(2);
    const g = State.groups.get(gid); if (!g) return showError("Group missing", "Group not found.");
    const enc = await ezo.groupEncrypt(g, ezo.te(JSON.stringify({ from: (State.PROFILE.inboxId||State.PROFILE.name), displayName: State.PROFILE.name, body: text })) );
    const payload = { gid, ivB64: ezo.b64e(enc.iv), ctB64: ezo.b64e(enc.ct) };
    for (const m of g.members) {
      const pkt = await sealedBoxEncryptTo(m.pubB64, ezo.packMsg("gmsg", payload));
      relay.relayPut(m.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
    }
    inp.value=""; appendMessage("g:"+g.id, text, true); renderCenter(); return;
  }

  // Unknown sender thread: auto-upgrade if we have their card in pending
  if (State.CURRENT_CHAT.startsWith("unk:")) {
    const id = State.CURRENT_CHAT.slice(4);
    let fr = State.friends.get(id);
    if (!fr) {
      const card = (State.pending.friends||[]).find(c=>c.id===id);
      if (card) {
        fr = {
          id: card.id, name: card.name||card.id, inbox: card.inbox||card.id,
          pubB64: card.pubB64, bio: card.bio||"", createdAt: Date.now(), mutual:false, ack:false
        };
        await ezo.saveFriend(State.PROFILE.ctx, fr);
        State.friends.set(fr.id, fr);
        State.pending.friends = State.pending.friends.filter(c=>c.id!==id);
        // migrate history
        const unkId = "unk:"+id;
        if (State.chats.has(unkId)) {
          const history = State.chats.get(unkId); State.chats.delete(unkId);
          const dest = State.chats.get(id) || []; State.chats.set(id, dest.concat(history));
        }
        State.CURRENT_CHAT = id;
        await sendHandshake(fr, /*hasMyCard*/ false);
      } else {
        showWarn("Missing their card", "You can't reply securely yet. Ask them to send their friend card, or use 'Send my card' in the right panel.");
        return;
      }
    }
    // falls through to normal friend send below
  }

  // Direct friend
  const fr = State.friends.get(State.CURRENT_CHAT);
  if (!fr) return showWarn("No friend selected", "Select a friend chat first.");

  const pkt = await sealedBoxEncryptTo(fr.pubB64, ezo.packMsg("text", { from: (State.PROFILE.inboxId||State.PROFILE.name), displayName: State.PROFILE.name, body: text }));
  relay.relayPut(fr.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
  inp.value=""; appendMessage(State.CURRENT_CHAT, text, true); renderCenter();
  fr.ack = true; await ezo.saveFriend(State.PROFILE.ctx, fr);
}

export async function sealedBoxEncryptTo(pubB64, payload){
  const eph = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, ezo.b64d(pubB64));
  const key = await ezo.hkdf(shared, ezo.te("sealed-box"));
  const {iv, ct} = await ezo.aesGcmEnc(key, payload, ezo.te(""));
  return { ephPub, iv, ct };
}
export async function sealedBoxDecryptFrom(priv, packet){
  const shared = x25519.getSharedSecret(priv, packet.ephPub);
  const key = await ezo.hkdf(shared, ezo.te("sealed-box"));
  return ezo.aesGcmDec(key, packet.iv, packet.ct, ezo.te(""));
}

/* ----------------------------- Invites / Handshake ----------------------------- */
export async function sendGroupInvite(group, friend){
  const pkt = await sealedBoxEncryptTo(friend.pubB64, ezo.packMsg("ginvite", { group }));
  relay.relayPut(friend.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
}
export function onGroupInvite(inv){ if (inv && inv.group) { State.pending.groups.push(inv); renderAll(); } }

export async function sendHandshake(friend, hasMyCard=false){
  const payload = { hasMyCard: !!hasMyCard, ts: Date.now(), from: (State.PROFILE.inboxId||State.PROFILE.name), displayName: State.PROFILE.name };
  const pkt = await sealedBoxEncryptTo(friend.pubB64, ezo.packMsg("handshake", payload));
  relay.relayPut(friend.inbox, { ephPub: ezo.b64e(pkt.ephPub), iv: ezo.b64e(pkt.iv), ct: ezo.b64e(pkt.ct) });
}

/* ----------------------------- Polling ----------------------------- */
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
  // incremental UI updates to reduce flicker and preserve selection
  try {
    // Track chats affected in this batch
    const affected = new Set();
    msgs.forEach((m)=>{
      try {
        const obj = JSON.parse(atob(m.ct||'')); // just to touch and avoid eslint; not actually used
      } catch {}
    });
    // Update open chat by appending only new messages
    // We estimate previous count by reading a data attribute set by renderCenter
    const box = $("chatView");
    const openId = box ? box.getAttribute("data-chat-id") : null;
    if (openId && State.chats.has(openId)){
      const prev = parseInt(box.getAttribute("data-rendered-count")||"0", 10);
      appendNewMessagesToOpenChat(openId, prev);
      box.setAttribute("data-rendered-count", String((State.chats.get(openId)||[]).length));
    }
    // Update unread styles for chats that got new messages (excluding the open one)
    // We derive from State.unread map
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

// Manual poll for a single relay URL
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
