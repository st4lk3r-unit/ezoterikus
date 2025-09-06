import { State } from '../../state.js';
import { esc } from '../sanitize/sanitize.js';

export function enhanceFriendList(){
  const cont = document.getElementById('chatsMount');
  if (!cont) return;
  const items = cont.querySelectorAll('.chat-item');
  items.forEach(div => {
    const id = div.dataset.chatId || div.textContent.trim();
    const fr = State.friends.get(id);
    const name = fr?.name || id;
    const avatarUrl = (fr && fr.avatar) ? fr.avatar : './assets/default-avatar.svg';
    div.innerHTML = `
      <div class="friend-row">
        <img class="avatar" src="${avatarUrl}" alt="">
        <div class="names">
          <div class="name">${esc(name)}</div>
          <div class="id muted">${esc(id)}</div>
        </div>
      </div>
    `;
  });
}