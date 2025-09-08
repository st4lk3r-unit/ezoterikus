import * as ezo from '../ezo.js';
import * as relay from '../relay.js';
import { State, appendMessage, markRead, saveSettingsToArchive } from '../state.js';
import { esc } from './sanitize/sanitize.js';

const $=(id)=>document.getElementById(id);

/* ----------------------------- Status bar ----------------------------- */
export function updateStatus(){
  const connected = relay.connectedCount();
  const r = $("statusRelays"); if (r) r.textContent = String(connected);
  const a = $("statusAutopoll"); if (a) a.textContent = State.SETTINGS.autoPoll ? "on" : "off";
  const l = $("statusLastPoll"); if (l) l.textContent = State.__lastPollStr || "—";
  const p = $("statusProfile"); if (p) p.textContent = State.PROFILE ? State.PROFILE.name : "none";
  const dot = $("statusDot");
  if (dot) dot.classList.toggle("red", connected === 0);
}
