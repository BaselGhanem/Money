const assert = require(`node:assert/strict`);
const test = require(`node:test`);
const C = require(`../planner-core.js`);

const makeRule = (originalDay, newDay, effectiveFrom) => ({
  id: `date-change`,
  enabled: true,
  startMonth: `2026-01`,
  versions: [
    { from: `0000-01-01`, day: originalDay },
    { from: effectiveFrom, day: newDay }
  ],
  template: {
    name: `اختبار تكرار`,
    amount: 100,
    type: `expense`,
    account: `Bank`,
    category: `فواتير`
  }
});

test(`moving recurrence from 1 to 28 takes effect in the same month`, () => {
  const rule = makeRule(1, 28, `2026-10-28`);
  assert.equal(C.occurrenceDate(rule, `2026-10`), `2026-10-28`);
  assert.equal(C.occurrenceDate(rule, `2026-11`), `2026-11-28`);
});

test(`moving recurrence from 28 to 1 does not backdate the current month`, () => {
  const rule = makeRule(28, 1, `2026-10-28`);
  assert.equal(C.occurrenceDate(rule, `2026-10`), `2026-10-28`);
  assert.equal(C.occurrenceDate(rule, `2026-11`), `2026-11-01`);
});

test(`monthly recurrence keeps its date in months with fewer days`, () => {
  const rule = makeRule(31, 31, `2026-11-01`);
  assert.equal(C.occurrenceDate(rule, `2026-02`), `2026-02-28`);
  assert.equal(C.occurrenceDate(rule, `2028-02`), `2028-02-29`);
});

test(`planner still excludes a recurrence outside the salary cycle`, () => {
  const state = {
    accounts: { Bank: { active: true } },
    recurrences: [makeRule(1, 28, `2026-10-28`)],
    months: { [`2026-10`]: { items: [], transfers: [] } }
  };
  const plan = C.build(state, `2026-10-25`, 1000, `regression`);
  const entries = plan.entries.filter(item => item.ruleId === `date-change`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, `2026-10-28`);
});
