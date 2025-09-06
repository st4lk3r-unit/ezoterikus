import * as ezo from '../../ezo.js';
import { State, appendMessage } from '../../state.js';
import { sendFileMeta } from '../../ui.js';
import { v4 as uuidv4 } from 'https://cdn.skypack.dev/uuid@9.0.1';

async function sha256(buf){
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function mountFilePicker(){
  const bar = document.getElementById('composerBar');
  if (!bar) return;
  if (document.getElementById('attachBtn')) return; // once
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <input type="file" id="attachInput" style="display:none;">
    <button id="attachBtn" class="button" title="Attach file">📎</button>
  `;
  bar.insertBefore(wrap, bar.firstChild);
  const btn = wrap.querySelector('#attachBtn');
  const inp = wrap.querySelector('#attachInput');
  btn.addEventListener('click', ()=> inp.click());
  inp.addEventListener('change', async (ev)=>{
    const f = ev.target.files?.[0];
    if (!f || !State.PROFILE) return;
    const arr = new Uint8Array(await f.arrayBuffer());
    const sum = await sha256(arr.buffer);
    const fileId = uuidv4();
    const chatId = State.CURRENT_CHAT;
    const relPath = `chat/${esc(chatId)}/files/${esc(fileId)}/${esc(f.name)}`;
    await ezo.writeFileToArchive(State.PROFILE.ctx, relPath, arr);
    const dataB64 = ezo.b64e(arr);
    const meta = { type:'file', fileId, name:f.name, size:f.size, mime: f.type||'application/octet-stream', relPath, sha256: sum, dataB64, from: State.PROFILE.name };
    appendMessage(chatId, JSON.stringify(meta), true);
    try { await sendFileMeta(meta); } catch {}
    ev.target.value = '';
  });
}