const { chromium } = require('playwright');
const fs = require('node:fs');
const base = process.env.SALARY_PREVIEW_URL || 'http://127.0.0.1:8765/salary/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const cases=[{name:'mobile-360',width:360,height:780},{name:'mobile-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'desktop-1440',width:1440,height:900}];
 let failed=0;
 fs.mkdirSync('design-artifacts',{recursive:true});
 for(const size of cases){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
  try{
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForTimeout(1200);
   const res=await page.evaluate(()=>{
    document.querySelector('#loader')?.classList.add('hidden');
    document.querySelector('#auth')?.classList.add('hidden');
    document.querySelector('#app')?.classList.remove('hidden');
    document.querySelector('#dashboardPage')?.classList.add('active');
    const css=[...document.styleSheets].some(s=>s.href?.includes('design-refresh.css'));
    const width=document.documentElement.scrollWidth;
    const hero=getComputedStyle(document.querySelector('.dailyHero')).backgroundImage;
    return {css,width,hero,viewport:innerWidth};
   });
   if(!res.css)throw Error('refresh stylesheet not loaded');
   if(res.width>res.viewport+2)throw Error('horizontal overflow: '+JSON.stringify(res));
   await page.screenshot({path:'design-artifacts/'+size.name+'-dashboard.png',fullPage:true});
   for(const [id,short] of [['transactionsPage','transactions'],['obligationsPage','obligations'],['accountsPage','accounts']]){
     await page.evaluate(id=>{document.querySelectorAll('.page').forEach(n=>n.classList.remove('active'));document.getElementById(id)?.classList.add('active')},id);
     await page.screenshot({path:'design-artifacts/'+size.name+'-'+short+'.png',fullPage:true});
   }
   console.log('PASS',size.name,res);
  }catch(e){failed++;console.error('FAIL',size.name,String(e))}finally{await page.close()}
 }
 await browser.close();if(failed)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
