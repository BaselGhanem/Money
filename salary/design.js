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

(()=>{`use strict`;
const page=document.getElementById(`settingsPage`);if(!page)return;
const icon=(path)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons={
profile:icon(`<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>`),
cloud:icon(`<path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10h-1M12 10v10m-3-3 3 3 3-3"/>`),
download:icon(`<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>`),
upload:icon(`<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>`),
install:icon(`<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>`),
appearance:icon(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>`),
general:icon(`<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>`),
data:icon(`<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>`),
chevron:icon(`<path d="m8 10 4 4 4-4"/>`)};
const head=page.querySelector(`.sectionHead`);head.classList.add(`settingsHeading`);head.querySelector(`h1`).textContent=`الاعدادات`;
const profile=document.createElement(`article`);profile.className=`settingsProfile`;profile.innerHTML=`<div class="settingsIdentity"><span class="settingsAvatar">${icons.profile}</span><div><strong id="settingsProfileName"></strong><span class="settingsCloudStatus">حالة المزامنة</span></div></div><div class="settingsCloudArt">${icons.cloud}</div>`;head.after(profile);
const actions=document.createElement(`div`);actions.className=`settingsQuickActions`;
for(const [target,label,key] of [[`exportJsonBtn`,`تنزيل نسخة`,`download`],[`importJsonInput`,`استرجاع نسخة`,`upload`],[`installAppBtn`,`تثبيت التطبيق`,`install`]]){
 const b=document.createElement(`button`);b.type=`button`;b.innerHTML=`<span>${icons[key]}</span><strong>${label}</strong>`;b.addEventListener(`click`,()=>{const control=document.getElementById(target);if(control?.disabled)return;if(target===`installAppBtn`)system.open=true;control?.click()});actions.append(b);
}profile.after(actions);
const grid=page.querySelector(`.settingsGrid`);const cards=[...grid.children];
function group(title,subtitle,key,nodes){const d=document.createElement(`details`);d.className=`settingsGroup`;d.innerHTML=`<summary><span class="settingsGroupIcon">${icons[key]}</span><span><strong>${title}</strong><small>${subtitle}</small></span><span class="settingsChevron">${icons.chevron}</span></summary><div class="settingsGroupBody"></div>`;nodes.forEach(node=>d.lastElementChild.append(node));grid.append(d);return d}
const general=group(`عام`,`الهوية والعملة وتفضيلات الحساب`,`general`,[cards[0],cards[2]]);
const appearance=group(`المظهر`,`الالوان والخصوصية والحركات`,`appearance`,[cards[1]]);
const data=group(`البيانات`,`النسخة الاحتياطية وادوات الشهر`,`data`,[cards[3]]);
const system=group(`النظام`,`تثبيت التطبيق على جهازك`,`install`,[page.querySelector(`.installCard`)]);
const desktop=matchMedia(`(min-width:761px)`);function adapt(){[general,appearance,data,system].forEach(g=>g.open=desktop.matches)}adapt();desktop.addEventListener(`change`,adapt);
function syncProfile(){const name=document.getElementById(`settingUserName`).value||`باسل`;const nameNode=document.getElementById(`settingsProfileName`);if(nameNode.textContent!==name)nameNode.textContent=name;const pill=document.getElementById(`moneyCloudPill`);const status=pill?.querySelector(`[data-cloud-label]`)?.textContent||`ربط السحابة`;const statusNode=profile.querySelector(`.settingsCloudStatus`);if(statusNode.textContent!==status)statusNode.textContent=status;const mode=pill?.dataset.mode||`offline`;if(profile.dataset.cloud!==mode)profile.dataset.cloud=mode;const disabled=!!document.getElementById(`installAppBtn`).disabled;if(actions.lastElementChild.disabled!==disabled)actions.lastElementChild.disabled=disabled}
window.addEventListener(`salary:render`,syncProfile);
document.getElementById(`settingUserName`).addEventListener(`input`,syncProfile);
new MutationObserver(syncProfile).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[`data-mode`,`disabled`]});
syncProfile();
})();
