
(()=>{`use strict`;
const docks=[];
function dock(scope,selectors){
 const host=document.querySelector(scope);if(!host)return;
 const nodes=selectors.flatMap(selector=>[...host.querySelectorAll(selector)]).filter(node=>!node.closest(`.scrollDock`));
 if(!nodes.length)return;
 const bar=document.createElement(`div`);bar.className=`scrollDock`;bar.setAttribute(`aria-label`,`الملخص والفلاتر الثابتة`);
 const anchor=nodes[0];anchor.before(bar);nodes.forEach(node=>bar.append(node));docks.push(bar);
}
function init(){
 dock(`#transactionsPage .panel`,[`.mobileFilterToggle`,`.toolbar`,`#transactionsChips`,`#accountCurrentBalance`]);
 dock(`#reportsPage .panel`,[`#reportTabs`,`.mobileFilterToggle`,`.toolbar`,`#reportsChips`,`#reportSummary`]);
 dock(`#obligationsPage`,[`#obligationMetrics`,`.mobileFilterToggle`,`.toolbar`]);
 dock(`#pendingPage .panel`,[`.mobileFilterToggle`,`.toolbar`]);
 dock(`#categoryDashboardBody`,[`#categoryMetrics`]);
 dock(`.categoryLedger`,[`.categoryLedgerTools`,`#categoryAdvancedFilters`,`#categoriesChips`]);
 dock(`.recurrenceSection`,[`#recurrenceSearch`]);
 dock(`.dateManagerPanel`,[`.mobileFilterToggle`,`.toolbar`,`#datesChips`,`.dateActions`]);
 const hero=document.querySelector(`#dailyHome .dailyHero`);if(hero&&!hero.parentElement.classList.contains(`scrollDock`))dock(`#dailyHome`,[`.dailyHero`]);
 document.querySelectorAll(`#accountsPage>.sectionHead`).forEach(node=>node.classList.add(`scrollDockHeading`));
 measure();
}
let frame=0;
function measure(){
 cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
 const active=document.querySelector(`.page.active`);if(!active)return;
 let offset=8;
 const spy=active.querySelector(`:scope>.sectionSpy`);if(spy?.getClientRects().length)offset+=spy.offsetHeight+8;
 for(const bar of docks.filter(node=>active.contains(node)&&node.getClientRects().length).sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1)){
 bar.style.setProperty(`--dock-top`,`${offset}px`);
 bar.classList.toggle(`scrollDockTall`,bar.scrollHeight>innerHeight*.48);
 offset+=Math.min(bar.offsetHeight,innerHeight*.48)+8;
 }
 });
}
window.addEventListener(`salary:render`,init);window.addEventListener(`load`,init);window.addEventListener(`resize`,measure);
document.addEventListener(`click`,()=>requestAnimationFrame(measure));
new ResizeObserver(measure).observe(document.documentElement);init();
})();
