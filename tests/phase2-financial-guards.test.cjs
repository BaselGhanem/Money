const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../salary/sync-core.js');

function fixture() {
  return { activeMonth: '2026-10', accounts: { Bank: { opening: 1000 } },
    months: { '2026-10': { items: [
      { id: 'bill', name: 'Bill', type: 'expense', obligationTotal: 100, amount: 100, completed: false, date: '2026-10-20', account: 'Bank' }
    ], transfers: [] } } };
}
function addPayment(s, amount, id = 'payment') {
  s.months['2026-10'].items.push({id, obligationId: 'bill', type:'expense', amount, completed: true, date:'2026-10-21', account:'Bank'});
}
test('a valid partial payment recomputes the outstanding amount', () => {
  const s=fixture();addPayment(s,60);core.validateAndRecompute(s);
  assert.equal(s.months['2026-10'].items[0].amount,40);
  assert.equal(s.months['2026-10'].items[0].completed,false);
});
test('full payment marks the obligation as completed', () => {
  const s=fixture();addPayment(s,100);core.validateAndRecompute(s);
  assert.equal(s.months['2026-10'].items[0].amount,0);
  assert.equal(s.months['2026-10'].items[0].completed,true);
});
test('negative and nonnumeric completed payments are rejected', () => {
  for(const amount of [-1,NaN,Infinity,0]) {
    const s=fixture();addPayment(s,amount);
    assert.throws(()=>core.validateAndRecompute(s),core.SyncConflict);
  }
});
test('a payment beyond the obligation total is rejected', () => {
  const s=fixture();addPayment(s,101);
  assert.throws(()=>core.validateAndRecompute(s),/exceed/);
});
test('negative obligation totals are rejected', () => {
  const s=fixture();s.months['2026-10'].items[0].obligationTotal=-100;
  assert.throws(()=>core.validateAndRecompute(s),core.SyncConflict);
});
test('signed balance adjustments are still accepted', () => {
  const s=fixture();s.months['2026-10'].items.push({id:'adjust',type:'adjustment',amount:-25,completed:true,account:'Bank'});
  assert.doesNotThrow(()=>core.validateAndRecompute(s));
});
test('negative ordinary expenses and income are rejected', () => {
  for(const type of ['income','expense']) {
    const s=fixture();s.months['2026-10'].items.push({id:type,type,amount:-20,completed:true,account:'Bank'});
    assert.throws(()=>core.validateAndRecompute(s),core.SyncConflict);
  }
});
test('an orphan payment is rejected', () => {
  const s=fixture();addPayment(s,20);s.months['2026-10'].items[1].obligationId='missing';
  assert.throws(()=>core.validateAndRecompute(s),/invalid payment link/);
});
