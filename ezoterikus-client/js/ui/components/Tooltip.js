let el;
export function showTooltip({ x, y, html }){
  if (!el){ el = document.createElement('div'); el.className='popover'; document.body.appendChild(el); }
  el.innerHTML = html;
  el.style.display = 'block';
  const rect = el.getBoundingClientRect();
  const offX = 12, offY = 12;
  el.style.left = Math.max(8, Math.min(window.innerWidth-rect.width-8, x+offX)) + 'px';
  el.style.top  = Math.max(8, Math.min(window.innerHeight-rect.height-8, y+offY)) + 'px';
}
export function hideTooltip(){ if (el) el.style.display='none'; }