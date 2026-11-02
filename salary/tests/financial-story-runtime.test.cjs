const test=require(`node:test`);
const assert=require(`node:assert/strict`);
const fs=require(`node:fs`);
const vm=require(`node:vm`);
const path=require(`node:path`);
const parent=path.resolve(__dirname,`..`);
const source=name=>fs.readFileSync(path.join(parent,name),`utf8`);
const app=source(`app-part1.txt`)+source(`app-part2.txt`);
function load(){
 const window={};
 const document={addEventListener(){},getElementById(){return null}};
 vm.runInNewContext(source(`financial-story.js`),{window,document,console});
 vm.runInNewContext(source(`sync-core.js`),{window,console});
 return {financial:window.FinancialStory,sync:window.SalarySyncCore};
}
function fixture(){
 const {financial}=load();
 const anchor=financial.ANCHOR;
 const state={
  accounts:{Bank:{opening:100}},
  months:{
   `2026-10`:{items:[
    {id:`salary-oct`,name:`Payroll`,type:`income`,recurrenceId:anchor,recurrenceMonth:`2026-10`,account:`Bank`,date:`2026-10-28`,amount:1000,completed:true},
    {id:`bill`,name:`Electricity`,type:`expense`,account:`Bank`,date:`2026-10-30`,amount:100,obligationTotal:100,completed:false}],transfers:[]},
   `2026-11`:{items:[
    {id:`salary-nov`,name:`Payroll`,type:`income`,recurrenceId:anchor,recurrenceMonth:`2026-11`,account:`Bank`,date:`2026-11-26`,amount:500,completed:true},
    {id:`bill-payment`,name:`Electricity payment`,type:`expense`,account:`Bank`,date:`2026-11-29`,amount:30,obligationId:`bill`,completed:true}],transfers:[]}
  },
  recurrences:[{id:anchor,template:{type:`income`,amount:1000}}]
 };
 return {state,financial};
}
test(`salary boot defines ensure() rather than patchedEnsure()`,()=>{
 assert.match(app,/function ensure\(m\)\s*\{/);
 assert.doesNotMatch(app,/function patchedEnsure\(m\)/);
 assert.doesNotThrow(()=>new Function(app));
});
test(`only the designated salary recurrence starts a cycle`,()=>{
 const {state,financial}=fixture();
 assert.equal(financial.cycles(state).length,2);
 state.months[`2026-11`].items.push({id:`other-income`,type:`income`,date:`2026-11-30`,account:`Bank`,amount:900,completed:true});
 assert.equal(financial.cycles(state).length,2);
});
test(`closed salary-cycle liability remains unchanged through sync merge`,()=>{
 const {state,financial}=fixture();
 const original=state.months[`2026-10`].items[1];
 assert.equal(financial.isLocked(state,original.date),true);
 const {sync}=load();
 const merged=sync.merge(state,state,state);
 const preserved=merged.months[`2026-10`].items.find(item=>item.id===`bill`);
 assert.equal(preserved.amount,100);
 assert.equal(preserved.completed,false);
 assert.equal(preserved.obligationTotal,100);
});
test(`history updates are rejected while current-cycle payments remain allowed`,()=>{
 const {state,financial}=fixture();
 const modified=JSON.parse(JSON.stringify(state));
 modified.months[`2026-10`].items[1].amount=1;
 assert.equal(financial.validateLockedChanges(state,modified),false);
 assert.equal(financial.isLocked(state,`2026-11-29`),false);
});

test(`settled obligations are excluded from the movement ledger while payment records stay`,()=>{
 const {state,financial}=fixture();
 const bill=state.months[`2026-10`].items.find(item=>item.id===`bill`);
 bill.obligationTotal=100;
 bill.amount=0;
 bill.completed=false; // Historical closed-cycle flag is immutable
 const payment=state.months[`2026-11`].items.find(item=>item.id===`bill-payment`);
 payment.amount=100;
 assert.equal(financial.status(state,bill,`2026-11-30`),`done`);
 assert.match(app,/obligationSummary\(x\)\.remaining<\.005/);
 assert.match(app,/مسدد بالكامل/);
 assert.match(app,/obligationCard:true/);
 assert.match(app,/data-complete-\$\{x.kind\}/);
});
