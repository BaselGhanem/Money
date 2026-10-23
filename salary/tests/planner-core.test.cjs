const assert=require('node:assert/strict');
const C=require('../planner-core.js');
const rule=(id,type,amount,day=28)=>({id,enabled:true,startMonth:'2026-09',versions:[{from:'0000-01-01',day}],template:{name:id,amount,type,account:'Bank',category:type==='income'?'دخل':'فواتير'}});
const state={accounts:{Bank:{active:true}},months:{'2026-10':{items:[],transfers:[]}},recurrences:[rule('salary','income',2200,25),rule('rent','expense',900),rule('loan','expense',400),rule('device','expense',180),rule('bills','expense',200)]};
let p=C.build(state,'2026-10-25',100,'p1');
assert.equal(p.end,'2026-11-24');assert.equal(C.totals(p).remaining,620);assert.equal(p.entries[0].type,'income');assert.deepEqual(p.entries.filter(x=>x.type==='expense').map(x=>x.amount),[900,400,200,180]);
assert.equal(C.cycleEnd('2026-01-31'),'2026-02-27');assert.equal(C.cycleEnd('2028-01-31'),'2028-02-28');assert.equal(C.cycleEnd('2026-12-25'),'2027-01-24');assert.equal(C.validDate('2026-02-31'),false);
p.entries[0].confidence='uncertain';assert.equal(C.totals(p).secureRemaining,-1580);assert.equal(C.totals(p).remaining,620);
p=C.build(state,'2026-10-25',100,'p1');let device=p.entries.find(x=>x.ruleId==='device');device.amount=150;assert.equal(C.totals(p).remaining,650);assert.equal(C.totals(p,true).remaining,620);assert.equal(C.changes(p).length,1);
const before=JSON.stringify(state),applied=C.approve(state,p,[device.id],'2026-10-22',()=> 'new');assert.equal(JSON.stringify(state),before);assert.equal(C.amountAt(applied.recurrences.find(x=>x.id==='device'),'2026-10-27'),180);assert.equal(C.amountAt(applied.recurrences.find(x=>x.id==='device'),'2026-10-28'),150);
assert.throws(()=>C.approve({...state,recurrences:state.recurrences.map(x=>x.id==='device'?{...x,enabled:false}:x)},p,[device.id],'2026-10-22',()=> 'new'),/تغير/);
assert.throws(()=>C.approve(state,p,[device.id],'2026-11-01',()=> 'new'),/رجعي/);
// Do not alter linked payments, paid obligations or executed historical records.
const withPayments=C.copy(state);withPayments.months['2026-10'].items=[{name:'device',account:'Bank',category:'فواتير',id:'past',recurrenceId:'device',recurrenceMonth:'2026-09',date:'2026-09-28',amount:180,type:'expense',completed:true},{name:'device',account:'Bank',category:'فواتير',id:'partial',recurrenceId:'device',recurrenceMonth:'2026-10',date:'2026-10-28',amount:80,obligationTotal:180,type:'expense',completed:false},{id:'payment',obligationId:'partial',date:'2026-10-20',amount:100,type:'expense',completed:true}];
const protectedPlan=C.build(withPayments,'2026-10-25',100,'p2');const protectedDevice=protectedPlan.entries.find(x=>x.ruleId==='device');protectedDevice.amount=140;const result=C.approve(withPayments,protectedPlan,[protectedDevice.id],'2026-10-22',()=> 'new');assert.deepEqual(result.months,withPayments.months);
// Skip a single occurrence, stop forward, and preserve history.
const future=C.copy(state);future.months['2026-10'].items=[{name:'device',account:'Bank',category:'فواتير',id:'oct',recurrenceId:'device',recurrenceMonth:'2026-10',date:'2026-10-28',amount:180,type:'expense',completed:false}];future.months['2026-11']={items:[{name:'device',account:'Bank',category:'فواتير',id:'nov',recurrenceId:'device',recurrenceMonth:'2026-11',date:'2026-11-28',amount:180,type:'expense',completed:false}],transfers:[]};
const skip=C.build(future,'2026-10-25',100,'p3');const sk=skip.entries.find(x=>x.ruleId==='device');sk.status='skip';const skipped=C.approve(future,skip,[sk.id],'2026-10-22',()=> 'new');assert.equal(skipped.months['2026-10'].items.length,0);assert.equal(skipped.months['2026-11'].items.length,1);assert.deepEqual(skipped.recurrences.find(x=>x.id==='device').skippedMonths,['2026-10']);
sk.status='pause';const stopped=C.approve(future,skip,[sk.id],'2026-10-22',()=> 'new');assert.equal(C.activeAt(stopped.recurrences.find(x=>x.id==='device'),'2026-10-27'),true);assert.equal(C.activeAt(stopped.recurrences.find(x=>x.id==='device'),'2026-11-28'),false);assert.equal(stopped.months['2026-11'].items.length,0);
sk.status='deferred';sk.date='2026-11-27';const deferred=C.approve(future,skip,[sk.id],'2026-10-22',()=> 'deferred-new');assert.equal(deferred.months['2026-11'].items.filter(x=>x.deferredFrom).length,1);assert.equal(C.totals(skip).expense,1500);
// Occurrences outside cycle excluded, paid occurrences remain counted once, new one-off plans stay nonfinancial.
const offset=C.build({...state,recurrences:[rule('outside','expense',50,24)]},'2026-10-25',0,'p4');assert.equal(offset.entries.length,1);assert.equal(offset.entries[0].date,'2026-11-24');
const noChanges=C.approve(state,C.build(state,'2026-10-25',100,'p5'),[],'2026-10-22',()=> 'new');assert.deepEqual(noChanges,state);
const invalid=C.copy(p);invalid.entries[0].amount=NaN;assert.throws(()=>C.validate(invalid));
console.log('Planner: cycle boundaries, totals, uncertainty, future versions, conflict guards, partial payments, skip, stop, defer and nonmutation passed.');
