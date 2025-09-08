import * as ezo from '../ezo.js';
import * as relay from '../relay.js';
import { State, appendMessage } from '../state.js';
import { showWarn, showError } from './modals.js';

import { ensureSessionFromCard, drEncrypt } from '../dr.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// DM send (pure Double Ratchet)
// ------------------------------------------------------
export async function sendNow() {
  try {
    const input = $('composerInput');
    const text = (input?.value ?? '').trim();
    if (!text) return;

    const chatId = State.CURRENT_CHAT;
    if (!chatId) return;

    if (chatId.startsWith('g:')) {
      showWarn('Groups disabled', 'Group messaging is temporarily disabled.');
      return;
    }

    const fr = State.friends.get(chatId);
    if (!fr) {
      showError('Unknown contact', 'Add a friend by scanning their v3 card first.');
      return;
    }

    if (!fr.cardV3) {
      showWarn('No prekey bundle', 'Scan/import the contact’s ezocard v3 (QR/NFC/file) before sending.');
      return;
    }

    const ctx = State.PROFILE.ctx;

    const addr = await ensureSessionFromCard(ctx, fr.id, fr.cardV3);

    const pt = ezo.te(JSON.stringify({
      from: State.PROFILE.inboxId,
      body: text,
      ts: Date.now()
    }));

    const { type, body } = await drEncrypt(ctx, addr, pt);

    await relay.relayPut(fr.inbox, {
      kind: 'dr-msg/v1',
      from: State.PROFILE.inboxId,
      type: (type === 'prekey' || type === 3) ? 'prekey' : 'signal',
      bodyB64: ezo.b64e(body),
      ts: Date.now()
    });

    appendMessage(chatId, text, true);
    if (input) input.value = '';
  } catch (err) {
    console.error('sendNow (DR) failed:', err);
    showError('Send failed', String(err?.message || err));
  }
}

// --------------------------------------------------------------------
// Groups (disabled for now)
// --------------------------------------------------------------------
export function sendGroupInvite() {
  showWarn('Groups disabled', 'Group features are temporarily disabled.');
}
export function onGroupInvite() {
  showWarn('Groups disabled', 'Group features are temporarily disabled.');
}
