(function(){
    if (window.__ezoDisablePatchInstalled) return;
    window.__ezoDisablePatchInstalled = true;
  
    const TARGETS = new Set([
      '#attachBtn',
      '#createGroupBtn',
      '#sendBack',
      '#sendCardBtn',
      '#inviteToGroupBtn',
      '#addMemberBtn'
    ]);
    const EXTRA = 'button[id^="accFSend_"]';
    const DISABLE_SEL = [...TARGETS, EXTRA].join(',');
  
    const MSG = 'Feature under construction';
  
    function ensureToast(){
      let t = document.getElementById('ezoToast');
      if (!t) {
        t = document.createElement('div');
        Object.assign(t.style, {
          position:'fixed', right:'16px', bottom:'16px',
          padding:'10px 14px', background:'rgba(0,0,0,0.85)',
          borderRadius:'10px', color:'#fff',
          font:'14px/1.3 system-ui, sans-serif',
          zIndex:'99999', display:'none'
        });
        t.id = 'ezoToast';
        document.body.appendChild(t);
      }
      return t;
    }
    function toast(msg){ const t=ensureToast(); t.textContent=msg||MSG; t.style.display='block'; clearTimeout(t._hideTimer); t._hideTimer=setTimeout(()=>{ t.style.display='none'; },1600); }
  
    function safeClosest(node, selector){
      let el = node instanceof Element ? node : node && node.parentElement;
      return el ? el.closest(selector) : null;
    }
  
    function markDisabled(node){
      if (!node) return;
      if (!node.classList.contains('ezo-disabled')){
        node.classList.add('ezo-disabled');
        node.setAttribute('aria-disabled','true');
        if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex','-1');
        if ('disabled' in node) node.disabled = true;
        const input = node.querySelector?.('input,select,button');
        if (input && 'disabled' in input) input.disabled = true;
        if (node.tagName === 'A' && node.hasAttribute('href')) {
          node._ezoHref = node.getAttribute('href');
          node.removeAttribute('href');
        }
      }
    }
  
    function intercept(ev){
      const hit = safeClosest(ev.target, `.ezo-disabled, ${DISABLE_SEL}`);
      if (!hit) return;
  
      markDisabled(hit);
  
      ev.preventDefault();
      ev.stopImmediatePropagation();
      ev.stopPropagation();
  
      if (ev.type === 'click' && ev.button !== 0) return;
      toast(MSG);
    }
    ['click','mousedown','mouseup','touchstart','keydown'].forEach(t =>
      document.addEventListener(t, intercept, true)
    );
  
    function scanOnce(){
      for (const sel of TARGETS) document.querySelectorAll(sel).forEach(markDisabled);
      document.querySelectorAll(EXTRA).forEach(markDisabled);
    }
    let scheduled=false;
    function scheduleScan(){ if (scheduled) return; scheduled=true; requestAnimationFrame(()=>{ scheduled=false; scanOnce(); }); }
  
    const mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList:true, subtree:true });
    window.addEventListener('load', scheduleScan);
    document.addEventListener('DOMContentLoaded', scheduleScan);
    scheduleScan();
  
    let tip;
    document.addEventListener('mouseover', (ev)=>{
      const el = safeClosest(ev.target, '.ezo-disabled');
      if (!el){ if (tip) tip.style.display='none'; return; }
      if (!tip){
        tip = document.createElement('div');
        Object.assign(tip.style, {
          position:'fixed', padding:'4px 6px',
          background:'rgba(0,0,0,0.8)', color:'#fff',
          borderRadius:'6px', font:'12px system-ui, sans-serif',
          pointerEvents:'none', zIndex:'100000', display:'none'
        });
        document.body.appendChild(tip);
      }
      tip.textContent = 'Under construction';
      tip.style.display = 'block';
    }, true);
    document.addEventListener('mousemove',(ev)=>{
      if (tip && tip.style.display==='block'){
        tip.style.left = (ev.clientX+12)+'px';
        tip.style.top  = (ev.clientY+12)+'px';
      }
    }, true);
  
  })();
  