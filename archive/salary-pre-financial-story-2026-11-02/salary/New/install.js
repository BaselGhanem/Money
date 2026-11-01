(()=>{
 `use strict`;
 let installPrompt=null;
 const installed=()=>window.matchMedia(`(display-mode: standalone)`).matches||navigator.standalone===true;
 const button=()=>document.getElementById(`installAppBtn`),status=()=>document.getElementById(`installStatus`);
 function update(){if(!button())return;if(installed()){button().disabled=true;button().textContent=`التطبيق مثبت على جهازك`;status().textContent=`أنت تستخدم راتبي كتطبيق مستقل.`}else{button().disabled=false;button().textContent=installPrompt?`تثبيت التطبيق`:`إضافة التطبيق إلى جهازك`}}
 window.addEventListener(`beforeinstallprompt`,event=>{event.preventDefault();installPrompt=event;update()});
 window.addEventListener(`appinstalled`,()=>{installPrompt=null;button().disabled=true;button().textContent=`تم تثبيت التطبيق`;status().textContent=`يمكنك الآن فتح راتبي من الشاشة الرئيسية.`});
 document.addEventListener(`DOMContentLoaded`,()=>{
  update();button()?.addEventListener(`click`,async()=>{if(!installPrompt){const help=document.getElementById(`installHelp`);help.open=true;status().textContent=`اتبع الخطوات أدناه لإضافة التطبيق من متصفحك.`;return}const prompt=installPrompt;installPrompt=null;button().disabled=true;try{await prompt.prompt();const choice=await prompt.userChoice;update();status().textContent=choice.outcome===`accepted`?`تمت الموافقة على التثبيت؛ سيكمل المتصفح إضافة التطبيق.`:`يمكنك تثبيت التطبيق لاحقا من قائمة المتصفح.`}catch{update();document.getElementById(`installHelp`).open=true;status().textContent=`استخدم خطوات التثبيت من قائمة متصفحك.`}});
  if(`serviceWorker` in navigator)navigator.serviceWorker.register(`./sw.js`).catch(()=>{});
 });
})();
