/* Salary-only synchronization. Loan continues to use cloud-sync-v4.js. */
(()=>{`use strict`;
const core=window.SalarySyncCore;
if(!core)return;
const KEY=`salary_manager_v2`,META=`money.cloud.meta.salary.v2`,RECOVERY=`money.salary.recovery.v2`;
const nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
const parse=raw=>{try{return JSON.parse(raw||`null`)}catch{return null}};
const read=()=>parse(localStorage.getItem(KEY));
const clientId=crypto.randomUUID?.()||`salary_${Date.now()}_${Math.random()}`;
let user=null,db=null,auth=null,unsubscribe=null,ready=false,writing=false,again=false,timer=null,base=null,blocked=false,remoteConflict=null,view=core.copy(read()),generation=0,deferred=false,serverEpoch=null;
let resolveInitialAuth;
const initialAuth=new Promise(resolve=>{resolveInitialAuth=resolve});
let status={mode:`offline`,label:`محفوظ على الجهاز · السحابة غير مربوطة`};
const config={apiKey:`AIzaSyDUSHbMd1A98_OpE3JSNXPD-XT0do8FutM`,authDomain:`moneywithbasel.firebaseapp.com`,projectId:`moneywithbasel`,storageBucket:`moneywithbasel.firebasestorage.app`,messagingSenderId:`1000601907861`,appId:`1:1000601907861:web:6995a21e42d36c1981a19c`};
const LINKED=`money.salary.cloud-linked.v1`;
function cloudGate(){
 // No blocking overlay: the cloud indicator remains available for status and manual connection.
 document.documentElement.classList.remove(`salary-cloud-pending`);
 const cover=document.getElementById(`salaryCloudGate`);
 if(cover)cover.remove();
}
function setStatus(mode,label){status={mode,label};const pill=document.getElementById(`moneyCloudPill`);if(pill){pill.dataset.mode=mode;pill.querySelector(`[data-cloud-label]`).textContent=label;pill.style.display=mode===`online`?`none`:``}cloudGate()}
function checkpoint(reason,payload){
 if(!payload)return;
 const snapshots=parse(localStorage.getItem(RECOVERY))||[];
 if(snapshots[0]&&core.equal(snapshots[0].payload,payload))return;
 const record={id:crypto.randomUUID?.()||`${Date.now()}`,at:new Date().toISOString(),uid:user?.uid||null,reason,payload};
 let history=[record,...snapshots].slice(0,4);
 while(history.length){try{nativeSet.call(localStorage,RECOVERY,JSON.stringify(history));return}catch(error){if(history.length===1)throw error;history.pop()}}
}
function download(name,payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:`application/json`}));const a=document.createElement(`a`);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function conflict(error,remote){
 blocked=true;remoteConflict=remote||remoteConflict;
 try{checkpoint(`sync-conflict-local`,read())}catch{}
 setStatus(`error`,`تعارض محفوظ للمراجعة · لم نستبدل بياناتك`);
 console.warn(`Salary sync paused:`,error.name||`SyncConflict`);
 window.dispatchEvent(new CustomEvent(`salary:sync-conflict`));
}
function ensureUi(){
 return; // Internal synchronization only.
 if(document.getElementById(`moneyCloudPill`))return;
 const style=document.createElement(`style`);style.textContent=`#moneyCloudPill{position:fixed;inset-inline-start:12px;top:12px;z-index:700;max-width:calc(100vw - 24px);padding:9px 12px;border:1px solid var(--hairline,#294046);border-radius:14px;background:var(--surface,#111a20);color:var(--text,#eef5f6);font:700 11px/1.7 Almarai,system-ui,sans-serif;box-shadow:0 8px 24px #0002}#moneyCloudPill button{all:unset;cursor:pointer}#moneyCloudPill[data-mode=error]{border-color:#c16b6b}#moneyCloudPill[data-mode=syncing]{border-color:#b79b60}#salarySyncReview{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:16px;background:#0009}#salarySyncReview[hidden]{display:none}#salarySyncReview>section{max-width:580px;max-height:85dvh;overflow:auto;padding:24px;border:1px solid var(--hairline,#294046);border-radius:22px;background:var(--surface,#111a20);color:var(--text,#eef5f6);font-family:Almarai,system-ui,sans-serif}#salarySyncReview p{line-height:1.9}#salarySyncReview .syncActions{display:flex;flex-wrap:wrap;gap:10px}@media(max-width:760px){#moneyCloudPill{top:auto;bottom:calc(86px + env(safe-area-inset-bottom))}}`;
 document.head.append(style);
 const pill=document.createElement(`div`);pill.id=`moneyCloudPill`;pill.innerHTML=`<button type="button" aria-label="حالة المزامنة السحابية"><span data-cloud-label></span></button>`;
 pill.querySelector(`button`).onclick=()=>{
  if(blocked){showReview();return}
  if(!auth){setStatus(`error`,`المزامنة غير متاحة · بياناتك محفوظة على الجهاز`);return}
  if(user){if(confirm(`البيانات محفوظة على هذا الجهاز. تسجيل الخروج من المزامنة السحابية؟`))auth.signOut();return}
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(()=>setStatus(`error`,`تعذر تسجيل الدخول · بياناتك محفوظة على الجهاز`));
 };
 document.body.append(pill);
 setStatus(status.mode,status.label);
}
function showReview(){
 let overlay=document.getElementById(`salarySyncReview`);
 if(!overlay){
  overlay=document.createElement(`div`);overlay.id=`salarySyncReview`;overlay.hidden=true;
  overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="salarySyncTitle"><h2 id="salarySyncTitle">مراجعة اختلاف النسخ</h2><p>اوقفنا المزامنة حتى لا تستبدل نسخة مختلفة دفعاتك. نسخة الجهاز محفوظة، ويمكن تنزيل النسختين للمراجعة. لا تعد تسجيل الدفعات قبل مراجعة الفرق.</p><div class="syncActions"><button class="btn ghost" data-sync-local>تنزيل نسخة الجهاز</button><button class="btn ghost" data-sync-remote>تنزيل نسخة السحابة</button><button class="btn ghost" data-sync-recovery>تنزيل سجل الاسترجاع</button><button class="btn primary" data-sync-retry>اعادة المحاولة</button><button class="btn ghost" data-sync-use-cloud>استخدام نسخة السحابة بعد المراجعة</button><button class="btn ghost" data-sync-close>اغلاق</button></div></section>`;
  overlay.querySelector(`[data-sync-local]`).onclick=()=>download(`salary-device-backup.json`,read());
  overlay.querySelector(`[data-sync-remote]`).onclick=()=>{if(remoteConflict)download(`salary-cloud-backup.json`,remoteConflict)};
  overlay.querySelector(`[data-sync-recovery]`).onclick=()=>download(`salary-recovery-log.json`,parse(localStorage.getItem(RECOVERY))||[]);
  overlay.querySelector(`[data-sync-close]`).onclick=()=>overlay.hidden=true;
  overlay.querySelector(`[data-sync-retry]`).onclick=()=>{blocked=false;overlay.hidden=true;if(base)schedule();else if(user)initialize().catch(handleError)};
  overlay.querySelector(`[data-sync-use-cloud]`).onclick=async()=>{
   if(!user||!db)return;
   if(!confirm(`استبدال العرض الحالي بنسخة السحابة؟ ستبقى نسخة الجهاز في سجل الاسترجاع ويمكن تنزيلها قبل المتابعة.`))return;
   try{const snap=await reference().get();if(!snap.exists)return;const payload=snap.data().payload;checkpoint(`user-reviewed-cloud-version`,read());setBase(payload);blocked=false;remoteConflict=null;apply(payload);overlay.hidden=true;setStatus(`online`,`تم تحميل النسخة التي اخترتها`)}catch(error){handleError(error)}
  };
  overlay.addEventListener(`keydown`,event=>{if(event.key===`Escape`){overlay.hidden=true;document.querySelector(`#moneyCloudPill button`)?.focus()}if(event.key===`Tab`){const buttons=[...overlay.querySelectorAll(`button`)];if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus()}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus()}}});
  document.body.append(overlay);
 }
 overlay.hidden=false;overlay.querySelector(`button`).focus();
}
function reference(){return db.collection(`moneyUsers`).doc(user.uid).collection(`apps`).doc(`salary`)}
function baseKey(){return `${META}.${user.uid}`}
function epochKey(){return `${META}.epoch.${user.uid}`}
function observeEpoch(doc){const epoch=doc?.restoreEpoch||`none`,previous=localStorage.getItem(epochKey());serverEpoch=epoch;nativeSet.call(localStorage,epochKey(),epoch);if(previous&&previous!==epoch){checkpoint(`before-restore`,read());return true}return false}
function setBase(payload){
 const value={uid:user.uid,payload:core.copy(payload)};
 // A baseline is only updated after a server read or a successful transaction.
 nativeSet.call(sessionStorage,baseKey(),JSON.stringify(value));
 base=value.payload;
}
function publishToApp(payload){view=core.copy(payload);window.dispatchEvent(new CustomEvent(`salary:cloud-state`,{detail:core.copy(payload)}))}
function apply(payload){
 const old=read();if(!core.equal(old,payload))checkpoint(`before-cloud-apply`,old);
 nativeSet.call(localStorage,KEY,JSON.stringify(payload));if(formOpen()){deferred=true;return}view=core.copy(payload);publishToApp(payload);
}
function handleError(error){
 if(error instanceof core.SyncConflict){conflict(error,remoteConflict);return}
 setStatus(`error`,`محفوظ على الجهاز · لم يتاكد الحفظ السحابي`);
 console.warn(`Salary synchronization unavailable:`,error.code||error.name||`error`);
}
function formOpen(){return !!document.querySelector(`.modal:not(.hidden)`)}
async function flush(){
 if(!user||!ready||blocked||!db)return;
 if(formOpen()){again=true;return}
 if(writing){again=true;return}
 const current=read();if(!current||!base)return;
 writing=true;again=false;
 const requestGeneration=generation,owner=user.uid,baseAtStart=core.copy(base),localAtStart=core.copy(current),ref=reference();
 setStatus(`syncing`,`محفوظ على الجهاز · جار التحقق من السحابة`);
 try{
  const committed=await db.runTransaction(async transaction=>{
   const snapshot=await transaction.get(ref);
   const document=snapshot.exists?snapshot.data():{};
   const remote=document.payload||baseAtStart;
   if((document.restoreEpoch||`none`)!==serverEpoch)throw new core.SyncConflict(`restore epoch changed`);
   remoteConflict=core.copy(remote);
   const merged=core.merge(baseAtStart,localAtStart,remote);
   if(!snapshot.exists||!core.equal(merged,remote))transaction.set(ref,{app:`salary`,payload:merged,syncProtocol:2,revision:Number(document.revision||0)+1,clientId,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAtMs:Date.now()},{merge:false});
   return merged;
  });
  if(requestGeneration!==generation||user?.uid!==owner)return;
  // Preserve edits made during the network request; they are not acknowledged yet.
  const latest=read(),next=core.merge(localAtStart,latest,committed);
  setBase(committed);remoteConflict=null;
  if(!core.equal(next,latest)){
   apply(next);
  }else view=core.copy(latest);
  if(core.financialEqual(next,committed))setStatus(`online`,`تم التحقق من الحفظ السحابي`);
  else{again=true;setStatus(`syncing`,`محفوظ على الجهاز · تغييرات بانتظار المزامنة`)}
 }catch(error){if(requestGeneration===generation)handleError(error)}
 finally{writing=false;if(again&&!blocked&&!formOpen())schedule()}
}
function schedule(){
 if(blocked)return;
 clearTimeout(timer);
 if(!user){setStatus(`offline`,`محفوظ على الجهاز · السحابة غير مربوطة`);return}
 setStatus(`syncing`,`محفوظ على الجهاز · بانتظار المزامنة`);
 if(ready)timer=setTimeout(()=>flush(),350);
}
Storage.prototype.setItem=function(key,value){
 if(this!==localStorage||key!==KEY)return nativeSet.call(this,key,value);
 const next=parse(String(value));if(!next)throw new Error(`Invalid salary state`);
 const stored=read();let result=next;
 // A stale tab must not replace another tab's newly recorded movements.
 if(view&&stored&&!core.equal(view,stored)){
  try{result=core.merge(view,next,stored)}catch(error){conflict(error,stored);throw error}
 }
 if(view)core.merge(view,result,result); // Validate links, totals, and payment deletions.
 const raw=JSON.stringify(result);
 nativeSet.call(this,key,raw);view=core.copy(result);
 if(!core.equal(result,next))queueMicrotask(()=>{if(formOpen())deferred=true;else publishToApp(read())});
 if(!core.equal(stored,result))schedule();
};
Storage.prototype.removeItem=function(key){
 if(this===localStorage&&key===KEY){checkpoint(`before-local-removal`,read());throw new Error(`Use the backup and restore controls to replace salary data`)}
 return nativeRemove.call(this,key);
};
window.addEventListener(`storage`,event=>{
 if(event.key!==KEY||!event.newValue)return;
 const incoming=parse(event.newValue);if(!incoming)return;
 // Keep an existing form intact; the next atomic write reconciles against its view.
 if(formOpen()){deferred=true;again=true;setStatus(`syncing`,`تحديث من تبويب اخر · سيطابق عند الحفظ`);return}
 try{if(view){const merged=core.merge(view,view,incoming);if(!core.equal(merged,incoming))throw new core.SyncConflict(`local tab state`)}view=core.copy(incoming);publishToApp(incoming);schedule()}catch(error){
 try{checkpoint(`incoming-tab-conflict`,incoming);checkpoint(`protected-tab-state`,view);if(view)nativeSet.call(localStorage,KEY,JSON.stringify(view))}catch{}
 conflict(error,incoming)
}
});
async function initialize(){
 const owner=user.uid,epoch=generation;
 ready=false;const snap=await reference().get();if(epoch!==generation||owner!==user?.uid)return;
 const current=read(),saved=parse(sessionStorage.getItem(baseKey()));
 if(!snap.exists){serverEpoch=`none`;setBase(current||{months:{}});ready=true;await flush();return}
 const restored=observeEpoch(snap.data());
 const remote=snap.data().payload;if(!remote?.months)throw new core.SyncConflict(`invalid cloud state`);
 remoteConflict=core.copy(remote);
 if(restored){setBase(remote);ready=true;apply(remote);blocked=false;remoteConflict=null;return}
 if(saved?.uid===owner&&saved.payload){base=core.copy(saved.payload);ready=true;await flush();return}
 if(!core.hasMovements(current)||core.financialEqual(current,remote)){
  setBase(remote);ready=true;
  if(!core.equal(current,remote)&&!formOpen())apply(remote);
  remoteConflict=null;setStatus(`online`,`تم التحقق من بيانات السحابة`);return;
 }
 // For an older device without a baseline, safely combine independent movements.
 // Ambiguous overlapping edits still require review to avoid losing payments.
 try{
  const combined=core.merge({months:{}},current,remote);
  checkpoint(`first-connection-merged-backup`,current);
  setBase(remote);ready=true;
  if(!core.equal(current,combined))apply(combined);
  if(!core.financialEqual(combined,remote))schedule();
  else setStatus(`online`,`الحركات محدثة على كل اجهزتك`);
  remoteConflict=null;
 }catch(error){ready=true;conflict(error,remote)}
}
function listen(){
 if(unsubscribe)unsubscribe();
 unsubscribe=reference().onSnapshot(snapshot=>{
  if(!snapshot.exists||snapshot.metadata?.hasPendingWrites||blocked||!ready)return;
  const data=snapshot.data();if(observeEpoch(data)){clearTimeout(timer);again=false;blocked=false;setBase(data.payload);apply(data.payload);return}
  if(data.clientId===clientId||core.equal(data.payload,base))return;
  if(formOpen()){again=true;setStatus(`syncing`,`تحديث متاح · اكمل النموذج للمزامنة`);return}
  // Apply a server change immediately when this device has no uncommitted edits.
  // Never overwrite local edits: reconcile those through the transactional writer.
  const local=read();
  if(base&&local&&core.equal(local,base)){
   try{
    core.merge(base,base,data.payload);
    setBase(data.payload);
    remoteConflict=null;
    apply(data.payload);
    setStatus(`online`,`الحركات محدثة على كل اجهزتك`);
   }catch(error){handleError(error)}
   return;
  }
  schedule();
 },handleError);
}
function resume(){if(formOpen())return;if(deferred){deferred=false;try{const current=read();if(view)core.merge(view,view,current);publishToApp(current)}catch(error){conflict(error,read())}}if(again&&!writing){again=false;schedule()}}
window.addEventListener(`salary:render`,resume);
document.addEventListener(`click`,()=>queueMicrotask(resume));
window.addEventListener(`online`,()=>{if(user&&!blocked){if(ready)schedule();else initialize().then(listen).catch(handleError)}});
window.addEventListener(`pagehide`,()=>{if(user&&ready&&!blocked)flush()});
window.salarySync={
 getStatus:()=>({...status}),
 restore:async payload=>{
  if(!user||!ready||!db||writing||blocked)throw new Error(`الاتصال غير جاهز للاستيراد`);
  const imported=core.copy(payload);core.validateAndRecompute(imported);
  if(!imported.months||!imported.accounts)throw new Error(`ملف الاستيراد غير صالح`);
  clearTimeout(timer);const owner=user.uid,requestGeneration=++generation;writing=true;
  try{
   const newEpoch=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
   await db.runTransaction(async transaction=>{
    const ref=reference(),snapshot=await transaction.get(ref),doc=snapshot.exists?snapshot.data():{};
    transaction.set(ref,{app:`salary`,payload:imported,syncProtocol:2,revision:Number(doc.revision||0)+1,restoreEpoch:newEpoch,clientId,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAtMs:Date.now()},{merge:false});
   });
   if(user?.uid!==owner||generation!==requestGeneration)throw new Error(`تغير الحساب خلال الاستيراد`);
   checkpoint(`before-user-import`,read());nativeSet.call(localStorage,epochKey(),newEpoch);
   serverEpoch=newEpoch;setBase(imported);blocked=false;remoteConflict=null;again=false;deferred=false;apply(imported);return true;
  }finally{writing=false}
 },
 isAuthenticated:()=>!!user,
 waitForInitialAuth:()=>initialAuth,
 connect:async()=>{
  await initialAuth;
  if(!auth)throw new Error(`تعذر الاتصال بقاعدة البيانات`);
  if(!user)await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  if(!user||!ready)await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{window.removeEventListener(`salary:sync-ready`,check);reject(new Error(`تعذر تحميل البيانات المشتركة`))},20000);
   const check=()=>{if(user&&ready&&!blocked){clearTimeout(timeout);window.removeEventListener(`salary:sync-ready`,check);resolve()}};
   window.addEventListener(`salary:sync-ready`,check);check();
  });
  if(blocked)throw new Error(`يوجد اختلاف في البيانات يحتاج مراجعة`);
 },
 retry:()=>{blocked=false;if(ready)schedule();else if(user)initialize().then(listen).catch(handleError)}
};
ensureUi();
if(!window.firebase){setStatus(`offline`,`محفوظ على الجهاز · المزامنة غير متاحة`);return}
const app=firebase.apps.length?firebase.app():firebase.initializeApp(config);auth=firebase.auth(app);db=firebase.firestore(app);
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(handleError);
auth.onAuthStateChanged(async current=>{
 resolveInitialAuth();generation++;clearTimeout(timer);if(unsubscribe){unsubscribe();unsubscribe=null}user=current;ready=false;base=null;blocked=false;
 if(!user){setStatus(`offline`,`السحابة غير متصلة · اربط حسابك لعرض الارصدة`);return}
 nativeSet.call(localStorage,LINKED,`1`);
 try{setStatus(`syncing`,`جار فحص النسخ قبل المزامنة`);await initialize();if(user)listen();window.dispatchEvent(new Event(`salary:sync-ready`))}catch(error){handleError(error)}
});
})();
