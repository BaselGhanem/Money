(()=>{`use strict`;
// Presentation and accessible dialog behavior only; no access to financial state.
const reduced=()=>matchMedia(`(prefers-reduced-motion: reduce)`).matches||document.body.classList.contains(`no-motion`);
function syncContrast(){const hex=getComputedStyle(document.documentElement).getPropertyValue(`--accent`).trim();if(!/^#[0-9a-f]{6}$/i.test(hex))return;const channels=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];const ink=luminance>.179?`#081014`:`#ffffff`;if(document.documentElement.style.getPropertyValue(`--button-ink`)!==ink)document.documentElement.style.setProperty(`--button-ink`,ink)}
new MutationObserver(syncContrast).observe(document.documentElement,{attributes:true,attributeFilter:[`style`]});
syncContrast();
document.getElementById(`toast`)?.setAttribute(`role`,`status`);
document.getElementById(`toast`)?.setAttribute(`aria-live`,`polite`);
const focusable=`button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]`;
const opened=new Map();
document.querySelectorAll(`.modal`).forEach(modal=>{
 modal.setAttribute(`role`,`dialog`);modal.setAttribute(`aria-modal`,`true`);
 const title=modal.querySelector(`h2`);if(title){if(!title.id)title.id=`${modal.id}Heading`;modal.setAttribute(`aria-labelledby`,title.id)}
 new MutationObserver(()=>{if(!modal.classList.contains(`hidden`)){
  if(!opened.has(modal)){opened.set(modal,document.activeElement);requestAnimationFrame(()=>{if(modal.classList.contains(`hidden`))return;if(!modal.contains(document.activeElement))modal.querySelector(focusable)?.focus()})}
 }else if(opened.has(modal)){const previous=opened.get(modal);opened.delete(modal);if(!document.querySelector(`.modal:not(.hidden)`))previous?.focus?.()}}).observe(modal,{attributes:true,attributeFilter:[`class`]});
});
document.addEventListener(`keydown`,event=>{
 const modal=[...document.querySelectorAll(`.modal:not(.hidden)`)].at(-1);if(!modal||event.defaultPrevented)return;
 if(event.key===`Escape`){const close=modal.querySelector(`[data-close]`);if(close){event.preventDefault();close.click()}return}
 if(event.key!==`Tab`)return;
 const nodes=[...modal.querySelectorAll(focusable)].filter(node=>node.getClientRects().length&&!node.classList.contains(`nativeComboControl`));
 const first=nodes[0],last=nodes.at(-1);if(!first)return;
 if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus()}
});
let frame=0;const values=new WeakMap();
const observer=new MutationObserver(records=>{if(reduced())return;const changed=new Set();for(const record of records){const node=(record.target.nodeType===3?record.target.parentElement:record.target)?.closest?.(`.moneyValue`);if(node)changed.add(node);for(const added of record.addedNodes){if(added.nodeType===1){if(added.matches(`.moneyValue`))changed.add(added);added.querySelectorAll?.(`.moneyValue`).forEach(item=>changed.add(item))}}}if(!changed.size)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{changed.forEach(node=>{const text=node.textContent;if(values.get(node)===text)return;values.set(node,text);node.classList.remove(`studioValue`);node.animate?.([{opacity:.55,transform:`translateY(3px)`},{opacity:1,transform:`translateY(0)`}],{duration:220,easing:`cubic-bezier(.16,1,.3,1)`})})})});
observer.observe(document.getElementById(`app`),{subtree:true,childList:true,characterData:true});
})();
