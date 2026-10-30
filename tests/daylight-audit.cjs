const { chromium } = require('playwright');
const fs = require('node:fs');
const base = process.env.SALARY_PREVIEW_URL || 'http://127.0.0.1:8765/salary/';
const pages=['dashboardPage','transactionsPage','accountsPage','obligationsPage','pendingPage','categoriesPage','plannerPage','reportsPage','datesPage','settingsPage','transfersPage','reconciliationPage'];
const sizes=[{name:'phone',width:390,height:844},{name:'desktop',width:1440,height:900}];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];fs.mkdirSync('daylight-artifacts',{recursive:true});
 for(const size of sizes){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},serviceWorkers:'block'});
  const page=await context.newPage();await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(()=>{document.querySelector('#auth')?.classList.add('hidden');document.querySelector('#app')?.classList.remove('hidden');document.querySelector('#loader')?.classList.add('hidden');document.body.classList.add('light');document.body.classList.remove('dark');});
  for(const id of pages){
   const data=await page.evaluate(id=>{
    document.querySelectorAll('.page').forEach(e=>e.classList.remove('active'));
    const section=document.getElementById(id);if(!section)return {error:'missing section'};
    section.classList.add('active');section.classList.remove('hidden');
    const parse=val=>{const m=(val||'').match(/rgba?\(([^)]+)\)/);if(!m)return null;const a=m[1].split(',').map(Number);return a.length===3?[...a,1]:a};
    const luminance=rgb=>{const [r,g,b]=rgb.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const candidates=[...section.querySelectorAll('h1,h2,h3,p,small,strong,span,label,button,a,input,select,.moneyValue,.heroAccountName')];
    const failures=[];let checked=0;
    for(const el of candidates){
     if(checked>500)break;
     const rect=el.getBoundingClientRect();if(rect.width<3||rect.height<3)continue;
     const style=getComputedStyle(el);if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)<.7)continue;
     if(!el.textContent.trim()&&!el.getAttribute('placeholder'))continue;
     let fg=parse(style.color);if(!fg||fg[3]<.99)continue;
     let node=el,bg=null,ambiguous=false;
     while(node&&node.nodeType===1){
      const cs=getComputedStyle(node);const paint=parse(cs.backgroundColor);
      if(cs.backgroundImage!=='none')ambiguous=true;
      if(paint&&paint[3]>=.99){bg=paint;break}
      if(paint&&paint[3]>0&&paint[3]<1){ambiguous=true;break}
      node=node.parentElement;
     }
     if(!bg||ambiguous)continue;
     const cr=ratio(fg,bg);checked++;
     if(cr<3.5)failures.push({tag:el.tagName,selector:el.id?'#'+el.id:el.className?.toString().slice(0,70),text:el.textContent.trim().slice(0,45),contrast:Number(cr.toFixed(2))});
    }
    return {checked,failures:failures.slice(0,30),totalFailures:failures.length,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
   },id);
   results.push({size:size.name,page:id,...data});
   await page.screenshot({path:'daylight-artifacts/'+size.name+'-'+id+'.png',fullPage:true});
  }
  await context.close();
 }
 await browser.close();
 fs.writeFileSync('daylight-artifacts/report.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.filter(r=>r.totalFailures).map(r=>({size:r.size,page:r.page,failures:r.failures})),null,2));
 const missing=results.filter(r=>r.error||r.checked===0||r.scrollWidth>r.viewport+2);
 if(missing.length){console.error('CRITICAL',missing);process.exit(1)}
})().catch(e=>{console.error(e);process.exit(1)});
