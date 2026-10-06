(()=>{`use strict`;
const root=document.getElementById(`loader`);if(!root)return;
const stories=[
[`planner`,`The Planner`,`PLAN THE MONTH. OWN THE MONTH.`,`المصاري المرتبة بتبدأ من حركة مسجلة صح.`],
[`payday`,`The Payday`,`PAYDAY IS HERE.`,`سجل الدخل قبل ما يبدأ الصرف.`],
[`hunter`,`The Expense Hunter`,`EVERY DINAR HAS A STORY.`,`سجلها... قبل ما تنساها.`],
[`analyst`,`The Analyst`,`DATA NEVER LIES.`,`كل حركة بتسجلها اليوم بتوضح صورتك بكرة.`],
[`mission`,`The Mission`,`NEW DAY. NEW MOVES.`,`خلي حساباتك تحت السيطرة.`],
[`coffee`,`The Coffee Scene`,`SMALL EXPENSES ADD UP.`,`حتى القهوة إلها مكان بالحسبة.`],
[`night`,`The Night Shift`,`STAY IN CONTROL.`,`دقيقة ترتيب اليوم... بتوفر عليك فوضى آخر الشهر.`],
[`road`,`On the Road`,`KEEP YOUR PLANS MOVING.`,`مشوارك أوضح لما تعرف وين بتصرف.`],
[`home`,`Home Base`,`BUILD YOUR PEACE OF MIND.`,`ترتيب التزاماتك اليوم بريحك بكرة.`],
[`weekend`,`The Reset`,`A FRESH START, EVERY DAY.`,`راجع حركاتك وخلي خطوتك الجاية واضحة.`]
];
let previous=``;try{previous=localStorage.getItem(`salary_last_loading_story`)||``}catch{}
const choices=stories.filter(s=>s[0]!==previous),story=choices[Math.floor(Math.random()*choices.length)];
try{localStorage.setItem(`salary_last_loading_story`,story[0])}catch{}
root.classList.add(`moneyStories`);root.dataset.story=story[0];
root.innerHTML=`<img class="storyArtwork" alt="" aria-hidden="true"><div class="storyShade"></div><div class="storyBrand" dir="ltr"><span class="storyMonogram">M</span><span>MONEY<span class="storyBrandSmall">PERSONAL FINANCIAL HQ</span></span></div><main class="storyContent"><span class="storyChapter" dir="ltr"></span><h1 dir="ltr"></h1><p dir="rtl"></p><div class="storyLoading"><div class="storyLoadLabel" dir="ltr"><span>LOADING YOUR FINANCIAL HQ...</span><span class="storyLoadState">جار التجهيز</span></div><div class="storyTrack" role="progressbar" aria-label="تحميل التطبيق" aria-valuemin="0" aria-valuemax="100"><span></span></div></div></main><span class="storyFootnote">مساحتك المالية. كل يوم.</span>`;
root.querySelector(`.storyChapter`).textContent=story[1];root.querySelector(`h1`).textContent=story[2];root.querySelector(`p`).textContent=story[3];
const artwork=root.querySelector(`img`),started=performance.now();
let ready=false,closed=false;
const imageReady=new Promise(resolve=>{const finish=()=>{root.classList.add(`artReady`);resolve()};artwork.onload=finish;artwork.onerror=finish;setTimeout(finish,1800)});
artwork.src=`loading/${story[0]}.webp`;
const track=root.querySelector(`.storyTrack`),bar=track.firstElementChild;
function stage(value,label){if(closed)return;bar.style.width=`${value}%`;track.setAttribute(`aria-valuenow`,String(value));root.querySelector(`.storyLoadState`).textContent=label}
stage(12,`جار التجهيز`);imageReady.then(()=>stage(35,`تجهيز المشهد`));
window.salaryLoadingReady=async()=>{if(ready)return;ready=true;await imageReady;stage(100,`جاهز`);const reduced=matchMedia(`(prefers-reduced-motion: reduce)`).matches;const minimum=reduced?0:1700;await new Promise(resolve=>setTimeout(resolve,Math.max(0,minimum-(performance.now()-started))));closed=true;root.classList.add(`storyExit`);setTimeout(()=>{root.classList.add(`done`);root.setAttribute(`aria-hidden`,`true`)},reduced?0:420)};
window.salaryLoadingError=()=>{root.classList.add(`storyError`);root.querySelector(`.storyLoadState`).textContent=`تعذر التحميل`;const button=document.createElement(`button`);button.className=`storyRetry`;button.textContent=`إعادة المحاولة`;button.onclick=()=>location.reload();root.querySelector(`.storyLoading`).append(button)};
})();
