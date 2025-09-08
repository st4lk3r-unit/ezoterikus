import * as ezo from '../ezo.js';
import * as relay from '../relay.js';
import { State, appendMessage, markRead, saveSettingsToArchive } from '../state.js';
import { esc } from './sanitize/sanitize.js';

const $=(id)=>document.getElementById(id);

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
      <h2>${esc(title||"Info")}</h2>
      <div class="dlg-msg">${message||""}</div>
      <div class="row right"><button id="ok" class="button primary">OK</button></div>
    </div>
  `, (box)=>{ box.querySelector("#ok").onclick = hideModal; });
}
export function showWarn(title, message){
  showModal(`
    <div class="dlg dlg-warn">
      <h2>${esc(title||"Warning")}</h2>
      <div class="dlg-msg">${esc(message||"")}</div>
      <div class="row right"><button id="ok" class="button primary">OK</button></div>
    </div>
  `, (box)=>{ box.querySelector("#ok").onclick = hideModal; });
}
export function showError(title, message){
  showModal(`
    <div class="dlg dlg-error">
      <h2>${esc(title||"Error")}</h2>
      <div class="dlg-msg">${esc(message||"")}</div>
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
        <div class="dlg-msg">${esc(message||"")}</div>
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
