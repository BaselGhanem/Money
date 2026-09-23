"use strict";

const STORAGE_KEY = `premiumLoanTracker.v2.bank20260923`;
const DEFAULT_STATE = Object.freeze({
  version: 1,
  loan: {
    name: `قرض البنك العربي`,
    amount: 51000,
    agreementDate: `2026-07-09`,
    termMonths: 176,
    annualRate: 6.1,
    monthlyPayment: 436,
    firstInstallmentDate: `2026-08-05`,
    declaredTotalPayments: 77255.12,
    declaredTotalInterest: 26255.12
  },
  extraPayments: [
    {
      id: `bank_extra_20260826`,
      date: `2026-08-26`,
      amount: 700,
      note: `دفعة إضافية فعلية حسب كشف البنك بتاريخ 23/09/2026`,
      createdAt: `2026-08-26T12:00:00.000Z`
    }
  ],
  notes: {},
  theme: `system`,
  colors: {
    accent: `#099999`,
    progress: `#168b62`
  },
  lastView: `dashboard`,
  filters: {
    scheduleMode: `updated`,
    scheduleYear: `all`,
    scheduleSearch: ``,
    schedulePage: 1,
    schedulePageSize: 30
  }
});

const ARABIC_MONTHS = Object.freeze([
  `يناير`, `فبراير`, `مارس`, `أبريل`, `مايو`, `يونيو`,
  `يوليو`, `أغسطس`, `سبتمبر`, `أكتوبر`, `نوفمبر`, `ديسمبر`
]);

let state = loadState();
let calculations = null;
let confirmationResolver = null;
const numberAnimationFrames = new WeakMap();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeState(defaults, saved) {
  return {
    ...clone(defaults),
    ...saved,
    loan: { ...clone(defaults.loan), ...(saved?.loan ?? {}) },
    colors: { ...clone(defaults.colors), ...(saved?.colors ?? {}) },
    filters: { ...clone(defaults.filters), ...(saved?.filters ?? {}) },
    extraPayments: Array.isArray(saved?.extraPayments) ? saved.extraPayments : [],
    notes: saved?.notes && typeof saved.notes === `object` ? saved.notes : {}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_STATE);
    return mergeState(DEFAULT_STATE, JSON.parse(raw));
  } catch (error) {
    console.error(`تعذر تحميل البيانات المحلية`, error);
    return clone(DEFAULT_STATE);
  }
}

function saveState({ pulse = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (pulse) showSavePulse();
  } catch (error) {
    console.error(`تعذر حفظ البيانات محليًا`, error);
    showToast(`تعذر الحفظ`, `مساحة التخزين المحلية غير متاحة أو ممتلئة.`, `error`);
  }
}

function showSavePulse() {
  const indicators = [$(`#saveIndicator`), $(`#mobileSaveIndicator`)].filter(Boolean);
  indicators.forEach((element) => element.classList.add(`is-saving`));
  window.setTimeout(() => indicators.forEach((element) => element.classList.remove(`is-saving`)), 750);
}

function safeNumber(value, fallback = 0) {
  const parsed = typeof value === `number` ? value : Number(String(value).replace(/,/g, ``));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 1e9) / 1e9;
}

function parseDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) return null;
  const [year, month, day] = dateString.split(`-`).map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function dateToKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, `0`);
  const day = String(date.getDate()).padStart(2, `0`);
  return `${year}-${month}-${day}`;
}

function addMonthsSafe(date, months) {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
  const targetDay = Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate());
  result.setDate(targetDay);
  return result;
}

function compareDateKeys(a, b) {
  return String(a).localeCompare(String(b));
}

function todayKey() {
  return dateToKey(new Date());
}

function formatMoney(value, decimals = 3) {
  return `${new Intl.NumberFormat(`en-JO`, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Math.max(0, safeNumber(value)))} د.أ`;
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(`ar-JO`, { maximumFractionDigits }).format(safeNumber(value));
}

function formatDate(dateOrKey, options = {}) {
  const date = typeof dateOrKey === `string` ? parseDate(dateOrKey) : dateOrKey;
  if (!date) return `—`;
  return new Intl.DateTimeFormat(`ar-JO`, {
    day: options.day ?? `2-digit`,
    month: options.month ?? `long`,
    year: options.year ?? `numeric`
  }).format(date);
}

function formatShortDate(dateOrKey) {
  const date = typeof dateOrKey === `string` ? parseDate(dateOrKey) : dateOrKey;
  if (!date) return `—`;
  return new Intl.DateTimeFormat(`ar-JO`, { day: `2-digit`, month: `2-digit`, year: `numeric` }).format(date);
}

function formatMonthYear(dateOrKey) {
  const date = typeof dateOrKey === `string` ? parseDate(dateOrKey) : dateOrKey;
  if (!date) return `—`;
  return `${ARABIC_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function pluralMonths(value) {
  const count = Math.max(0, Math.round(safeNumber(value)));
  if (count === 0) return `0 شهر`;
  if (count === 1) return `شهر واحد`;
  if (count === 2) return `شهران`;
  if (count >= 3 && count <= 10) return `${formatNumber(count)} أشهر`;
  return `${formatNumber(count)} شهر`;
}

function pluralInstallments(value) {
  const count = Math.max(0, Math.round(safeNumber(value)));
  if (count === 0) return `0 قسط`;
  if (count === 1) return `قسط واحد`;
  if (count === 2) return `قسطان`;
  if (count >= 3 && count <= 10) return `${formatNumber(count)} أقساط`;
  return `${formatNumber(count)} قسط`;
}

function durationLabel(months) {
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const remainder = total % 12;
  if (!years) return pluralMonths(remainder);
  if (!remainder) return `${formatNumber(years)} سنة`;
  return `${formatNumber(years)} سنة و${pluralMonths(remainder)}`;
}

function getValidLoan(loan = state.loan) {
  const amount = Math.max(0.001, safeNumber(loan.amount));
  const monthlyPayment = Math.max(0.001, safeNumber(loan.monthlyPayment));
  const annualRate = Math.max(0, safeNumber(loan.annualRate));
  const termMonths = Math.max(1, Math.round(safeNumber(loan.termMonths, 1)));
  const firstDate = parseDate(loan.firstInstallmentDate) ?? parseDate(DEFAULT_STATE.loan.firstInstallmentDate);
  return { ...loan, amount, monthlyPayment, annualRate, termMonths, firstInstallmentDate: dateToKey(firstDate) };
}

function normalizeExtraPayments(payments = state.extraPayments) {
  return payments
    .map((payment) => ({
      id: String(payment.id ?? cryptoRandomId()),
      date: parseDate(payment.date) ? payment.date : state.loan.firstInstallmentDate,
      amount: Math.max(0, safeNumber(payment.amount)),
      note: String(payment.note ?? ``).trim().slice(0, 160),
      createdAt: payment.createdAt ?? new Date().toISOString()
    }))
    .filter((payment) => payment.amount > 0)
    .sort((a, b) => compareDateKeys(a.date, b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function cryptoRandomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateSchedule(loanInput, extraPaymentsInput = []) {
  const loan = getValidLoan(loanInput);
  const extras = normalizeExtraPayments(extraPaymentsInput);
  const firstDate = parseDate(loan.firstInstallmentDate);
  const agreementDate = parseDate(loan.agreementDate) ?? new Date(2026, 6, 9, 12, 0, 0, 0);
  const rows = [];
  const extraApplications = {};
  const maxMonths = Math.max(loan.termMonths * 6, 1200);
  const annualRate = loan.annualRate / 100;
  const monthlyRate = annualRate / 12;
  const roundCent = (value) => Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  const daysBetweenKeys = (fromKey, toKey) => {
    const from = parseDate(fromKey);
    const to = parseDate(toKey);
    if (!from || !to) return 0;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
  };

  let balance = roundCent(loan.amount);
  let totalInterest = 0;
  let totalRegularPayments = 0;
  let totalExtraApplied = 0;
  let extraIndex = 0;
  let previousDueKey = dateToKey(agreementDate);

  for (let installment = 1; balance > 0.0000001 && installment <= maxMonths; installment += 1) {
    const dueDate = addMonthsSafe(firstDate, installment - 1);
    const dueKey = dateToKey(dueDate);
    const rowExtras = [];
    let extraTotal = 0;
    let extraPayoffDate = null;
    let accruedInterest = 0;
    let accrualCursor = previousDueKey;
    const openingBalance = balance;

    while (extraIndex < extras.length && compareDateKeys(extras[extraIndex].date, dueKey) < 0) {
      const extra = extras[extraIndex];

      if (compareDateKeys(extra.date, previousDueKey) > 0 && balance > 0.0000001) {
        const days = daysBetweenKeys(accrualCursor, extra.date);
        if (days > 0 && annualRate > 0) accruedInterest += balance * annualRate * (days / 360);
        accrualCursor = extra.date;

        const before = balance;
        const applied = roundCent(Math.min(extra.amount, balance));
        balance = roundCent(balance - applied);
        if (balance <= 0.0000001 && !extraPayoffDate) extraPayoffDate = extra.date;
        totalExtraApplied = roundCent(totalExtraApplied + applied);
        extraTotal = roundCent(extraTotal + applied);
        rowExtras.push({ ...extra, applied });
        extraApplications[extra.id] = {
          balanceBefore: before,
          balanceAfter: balance,
          applied,
          installment,
          dueDate: dueKey
        };
      } else if (!extraApplications[extra.id]) {
        extraApplications[extra.id] = {
          balanceBefore: balance,
          balanceAfter: balance,
          applied: 0,
          installment: null,
          dueDate: null
        };
      }
      extraIndex += 1;
    }

    if (balance <= 0.0000001) {
      rows.push({
        installment,
        date: extraPayoffDate ?? dueKey,
        scheduledDueDate: dueKey,
        payment: 0,
        principal: 0,
        interest: 0,
        extraPayment: extraTotal,
        remainingBalance: 0,
        openingBalance,
        balanceAfterExtras: balance,
        notes: rowExtras.map((item) => item.note).filter(Boolean).join(`، `),
        extraIds: rowExtras.map((item) => item.id),
        isFinal: true,
        payoffByExtraOnly: true
      });
      previousDueKey = dueKey;
      break;
    }

    const remainingDays = daysBetweenKeys(accrualCursor, dueKey);
    if (remainingDays > 0 && annualRate > 0) accruedInterest += balance * annualRate * (remainingDays / 360);
    const interest = roundCent(accruedInterest);
    const contractualDue = roundCent(balance + interest);
    const regularPayment = roundCent(Math.min(loan.monthlyPayment, contractualDue));
    const principal = Math.max(0, roundCent(regularPayment - interest));
    balance = Math.max(0, roundCent(balance - principal));
    totalInterest = roundCent(totalInterest + interest);
    totalRegularPayments = roundCent(totalRegularPayments + regularPayment);

    while (extraIndex < extras.length && compareDateKeys(extras[extraIndex].date, dueKey) === 0) {
      const extra = extras[extraIndex];
      const before = balance;
      const applied = roundCent(Math.min(extra.amount, balance));
      balance = Math.max(0, roundCent(balance - applied));
      totalExtraApplied = roundCent(totalExtraApplied + applied);
      extraTotal = roundCent(extraTotal + applied);
      rowExtras.push({ ...extra, applied });
      extraApplications[extra.id] = {
        balanceBefore: before,
        balanceAfter: balance,
        applied,
        installment,
        dueDate: dueKey
      };
      extraIndex += 1;
    }

    rows.push({
      installment,
      date: dueKey,
      scheduledDueDate: dueKey,
      payment: regularPayment,
      principal,
      interest,
      extraPayment: extraTotal,
      remainingBalance: balance,
      openingBalance,
      balanceAfterExtras: roundCent(openingBalance - extraTotal),
      notes: rowExtras.map((item) => item.note).filter(Boolean).join(`، `),
      extraIds: rowExtras.map((item) => item.id),
      isFinal: balance <= 0.0000001,
      payoffByExtraOnly: false
    });
    previousDueKey = dueKey;
  }

  while (extraIndex < extras.length) {
    const extra = extras[extraIndex];
    extraApplications[extra.id] = {
      balanceBefore: 0,
      balanceAfter: 0,
      applied: 0,
      installment: null,
      dueDate: null
    };
    extraIndex += 1;
  }

  return {
    loan,
    rows,
    extraApplications,
    totalInterest,
    totalRegularPayments,
    totalExtraApplied,
    totalPayments: roundCent(totalRegularPayments + totalExtraApplied),
    payoffDate: rows.at(-1)?.date ?? loan.firstInstallmentDate,
    durationMonths: rows.length,
    monthlyRate
  };
}

function buildExtraImpactRows(loan, payments) {
  const sorted = normalizeExtraPayments(payments);
  const impacts = [];
  let previousSet = [];
  let previousSchedule = generateSchedule(loan, previousSet);

  for (const payment of sorted) {
    const currentSet = [...previousSet, payment];
    const currentSchedule = generateSchedule(loan, currentSet);
    const application = currentSchedule.extraApplications[payment.id] ?? {
      balanceBefore: 0,
      balanceAfter: 0,
      applied: 0
    };
    impacts.push({
      ...payment,
      ...application,
      incrementalInterestSaved: Math.max(0, roundMoney(previousSchedule.totalInterest - currentSchedule.totalInterest)),
      incrementalMonthsSaved: Math.max(0, previousSchedule.durationMonths - currentSchedule.durationMonths),
      cumulativeInterestSaved: Math.max(0, roundMoney(generateSchedule(loan, []).totalInterest - currentSchedule.totalInterest)),
      cumulativeMonthsSaved: Math.max(0, generateSchedule(loan, []).durationMonths - currentSchedule.durationMonths)
    });
    previousSet = currentSet;
    previousSchedule = currentSchedule;
  }
  return impacts;
}

function calculateAll() {
  state.loan = getValidLoan(state.loan);
  state.extraPayments = normalizeExtraPayments(state.extraPayments);
  const original = generateSchedule(state.loan, []);
  const updated = generateSchedule(state.loan, state.extraPayments);
  const extraImpacts = buildExtraImpactRows(state.loan, state.extraPayments);
  const currentDate = todayKey();
  const elapsedRows = updated.rows.filter((row) => compareDateKeys(row.date, currentDate) < 0);
  const nextRow = updated.rows.find((row) => compareDateKeys(row.date, currentDate) >= 0) ?? null;
  const currentBalance = elapsedRows.at(-1)?.remainingBalance ?? state.loan.amount;
  const totalPaidToDate = elapsedRows.reduce((sum, row) => sum + row.payment + row.extraPayment, 0);
  const totalPrincipalPaidToDate = Math.max(0, state.loan.amount - currentBalance);
  const completion = state.loan.amount > 0 ? Math.min(100, Math.max(0, (totalPrincipalPaidToDate / state.loan.amount) * 100)) : 100;
  const monthsSaved = Math.max(0, original.durationMonths - updated.durationMonths);
  const interestSaved = Math.max(0, roundMoney(original.totalInterest - updated.totalInterest));
  const declaredDifference = roundMoney(state.loan.declaredTotalPayments - original.totalPayments);

  calculations = {
    original,
    updated,
    extraImpacts,
    currentDate,
    elapsedRows,
    nextRow,
    currentBalance,
    totalPaidToDate,
    totalPrincipalPaidToDate,
    completion,
    monthsSaved,
    interestSaved,
    remainingInstallments: updated.rows.filter((row) => compareDateKeys(row.date, currentDate) >= 0).length,
    declaredDifference
  };
  return calculations;
}

function renderAll() {
  calculateAll();
  applyTheme();
  renderDashboard();
  renderSimulator();
  renderExtraPayments();
  renderScheduleControls();
  renderSchedule();
  renderTimeline();
  renderReports();
  renderSettings();
}

function renderDashboard() {
  const c = calculations;
  const original = c.original;
  const updated = c.updated;
  const next = c.nextRow;
  $(`#asOfDate`).textContent = formatDate(c.currentDate);
  $(`#heroProgressRing`).style.setProperty(`--progress`, c.completion.toFixed(2));
  animateTextNumber($(`#heroProgressValue`), c.completion, (value) => `${value.toFixed(1)}%`);
  animateTextNumber($(`#heroMonthsSaved`), c.monthsSaved, (value) => formatNumber(Math.round(value)));
  animateTextNumber($(`#heroInterestSaved`), c.interestSaved, (value) => formatMoney(value));
  $(`#heroMessage`).textContent = c.monthsSaved > 0
    ? `ممتاز، قللت مدة القرض ${pluralMonths(c.monthsSaved)}. استمر بنفس النهج.`
    : `كل دفعة إضافية بتقربك من الحرية المالية.`;

  const cards = [
    { label: `الرصيد المتبقي`, value: formatMoney(c.currentBalance), hint: `بعد احتساب الأقساط المنقضية حتى اليوم`, icon: `◒`, highlight: true },
    { label: `القسط الشهري`, value: formatMoney(state.loan.monthlyPayment), hint: `ثابت حتى القسط الأخير`, icon: `↔` },
    { label: `نسبة الفائدة`, value: `${safeNumber(state.loan.annualRate).toFixed(4)}%`, hint: `فائدة سنوية / احتساب شهري`, icon: `%` },
    { label: `المدة الأصلية`, value: durationLabel(original.durationMonths), hint: `${formatNumber(original.durationMonths)} قسط`, icon: `⌛` },
    { label: `موعد السداد المحدّث`, value: formatDate(updated.payoffDate), hint: c.monthsSaved ? `أبكر بـ ${pluralMonths(c.monthsSaved)}` : `لا تغيير حتى الآن`, icon: `✓` },
    { label: `الفائدة بعد الدفعات`, value: formatMoney(updated.totalInterest), hint: `الأصلية ${formatMoney(original.totalInterest)}`, icon: `∿` },
    { label: `إجمالي المدفوع حتى اليوم`, value: formatMoney(c.totalPaidToDate), hint: `أقساط + دفعات إضافية منقضية`, icon: `↑` },
    { label: `إجمالي الدفعات الإضافية`, value: formatMoney(updated.totalExtraApplied), hint: `${formatNumber(state.extraPayments.length)} دفعة مسجلة`, icon: `＋` }
  ];

  $(`#dashboardCards`).innerHTML = cards.map((card) => `
    <article class="metric-card reveal ${card.highlight ? `highlight` : ``}">
      <div class="metric-top"><span>${escapeHtml(card.label)}</span><span class="metric-icon">${card.icon}</span></div>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
    </article>
  `).join(``);

  $(`#originalPayoffDate`).textContent = formatDate(original.payoffDate);
  $(`#updatedPayoffDate`).textContent = formatDate(updated.payoffDate);
  $(`#originalDurationLabel`).textContent = durationLabel(original.durationMonths);
  $(`#updatedDurationLabel`).textContent = durationLabel(updated.durationMonths);
  $(`#compareMonthsSaved`).textContent = pluralMonths(c.monthsSaved);
  $(`#compareInterestSaved`).textContent = formatMoney(c.interestSaved);
  $(`#compareExtraTotal`).textContent = formatMoney(updated.totalExtraApplied);
  $(`#payoffStatusPill`).textContent = c.monthsSaved > 0 ? `تم تقليل المدة` : `الخطة الأصلية`;

  $(`#nextPaymentAmount`).textContent = next ? formatMoney(next.payment) : `تم السداد`;
  $(`#nextPaymentDate`).textContent = next ? formatDate(next.date) : `—`;
  $(`#nextPaymentMonth`).textContent = next ? formatMonthYear(next.date) : `مكتمل`;
  $(`#nextPrincipal`).textContent = next ? formatMoney(next.principal) : `—`;
  $(`#nextInterest`).textContent = next ? formatMoney(next.interest) : `—`;
  $(`#remainingInstallments`).textContent = pluralInstallments(c.remainingInstallments);

  renderRecentExtraPayments();
}

function renderRecentExtraPayments() {
  const container = $(`#recentExtraPayments`);
  const recent = [...calculations.extraImpacts].sort((a, b) => compareDateKeys(b.date, a.date)).slice(0, 4);
  if (!recent.length) {
    container.innerHTML = `<div class="mini-empty">لا توجد دفعات إضافية مسجلة. أول دفعة ستُظهر أثرها هنا مباشرة.</div>`;
    return;
  }
  container.innerHTML = `<div class="recent-list">${recent.map((payment) => `
    <div class="recent-item">
      <span class="recent-item-icon">↘</span>
      <div><strong>${escapeHtml(payment.note || `دفعة تحت الحساب`)}</strong><span>${formatDate(payment.date)} · وفّرت ${pluralMonths(payment.incrementalMonthsSaved)}</span></div>
      <strong>${formatMoney(payment.amount)}</strong>
    </div>
  `).join(``)}</div>`;
}

function renderSimulator() {
  const dateInput = $(`#simulatorDate`);
  if (!dateInput.value) dateInput.value = getSuggestedExtraDate();
  const amount = safeNumber($(`#simulatorAmount`).value);
  const date = dateInput.value;
  const note = $(`#simulatorNote`).value.trim();
  const preview = calculatePreviewPayment({ date, amount, note });
  $(`#simulatorPreview`).innerHTML = previewMarkup(preview);
  $(`#motivationSaved`).textContent = formatMoney(calculations.interestSaved);
  $(`#motivationMonths`).textContent = pluralMonths(calculations.monthsSaved);
}

function calculatePreviewPayment(payment, excludeId = null) {
  const validDate = parseDate(payment.date);
  const amount = Math.max(0, safeNumber(payment.amount));
  if (!validDate || amount <= 0) {
    return {
      valid: false,
      payoffDate: calculations.updated.payoffDate,
      monthsSaved: 0,
      interestSaved: 0,
      balanceBefore: calculations.currentBalance,
      balanceAfter: calculations.currentBalance,
      applied: 0
    };
  }
  const basePayments = state.extraPayments.filter((item) => item.id !== excludeId);
  const beforeSchedule = generateSchedule(state.loan, basePayments);
  const tempPayment = { id: `preview`, date: dateToKey(validDate), amount, note: payment.note ?? ``, createdAt: new Date().toISOString() };
  const afterSchedule = generateSchedule(state.loan, [...basePayments, tempPayment]);
  const application = afterSchedule.extraApplications.preview ?? { balanceBefore: 0, balanceAfter: 0, applied: 0 };
  return {
    valid: application.applied > 0,
    payoffDate: afterSchedule.payoffDate,
    monthsSaved: Math.max(0, beforeSchedule.durationMonths - afterSchedule.durationMonths),
    interestSaved: Math.max(0, roundMoney(beforeSchedule.totalInterest - afterSchedule.totalInterest)),
    balanceBefore: application.balanceBefore,
    balanceAfter: application.balanceAfter,
    applied: application.applied,
    totalDuration: afterSchedule.durationMonths
  };
}

function previewMarkup(preview) {
  return `
    <div class="preview-item"><span>الرصيد قبل الدفعة</span><strong>${formatMoney(preview.balanceBefore)}</strong></div>
    <div class="preview-item"><span>الرصيد بعد الدفعة</span><strong>${formatMoney(preview.balanceAfter)}</strong></div>
    <div class="preview-item positive"><span>فائدة موفرة</span><strong>${formatMoney(preview.interestSaved)}</strong></div>
    <div class="preview-item positive"><span>أشهر موفرة</span><strong>${pluralMonths(preview.monthsSaved)}</strong></div>
    <div class="preview-item"><span>موعد السداد الجديد</span><strong>${formatDate(preview.payoffDate)}</strong></div>
    <div class="preview-item"><span>المبلغ المطبق فعليًا</span><strong>${formatMoney(preview.applied)}</strong></div>
  `;
}

function renderExtraPayments() {
  const body = $(`#extraPaymentsBody`);
  const empty = $(`#extraEmptyState`);
  const impacts = calculations.extraImpacts;
  $(`#extraCountChip`).textContent = `${formatNumber(impacts.length)} دفعة`;
  if (!impacts.length) {
    body.innerHTML = ``;
    empty.classList.remove(`hidden`);
    return;
  }
  empty.classList.add(`hidden`);
  body.innerHTML = impacts.map((payment) => `
    <tr data-extra-id="${escapeHtml(payment.id)}">
      <td>${formatDate(payment.date)}</td>
      <td><strong>${formatMoney(payment.amount)}</strong>${payment.applied < payment.amount ? `<small class="cell-subnote">المطبق ${formatMoney(payment.applied)}</small>` : ``}</td>
      <td class="note-cell">${escapeHtml(payment.note || `—`)}</td>
      <td>${formatMoney(payment.balanceBefore)}</td>
      <td>${formatMoney(payment.balanceAfter)}</td>
      <td class="amount-positive">${formatMoney(payment.incrementalInterestSaved)}</td>
      <td class="amount-positive">${pluralMonths(payment.incrementalMonthsSaved)}</td>
      <td>
        <div class="row-actions">
          <button class="table-icon-button" type="button" data-edit-extra="${escapeHtml(payment.id)}" aria-label="تعديل">✎</button>
          <button class="table-icon-button delete" type="button" data-delete-extra="${escapeHtml(payment.id)}" aria-label="حذف">×</button>
        </div>
      </td>
    </tr>
  `).join(``);
}

function renderScheduleControls() {
  const mode = state.filters.scheduleMode;
  $$(`#scheduleMode button`).forEach((button) => button.classList.toggle(`is-active`, button.dataset.mode === mode));
  const rows = mode === `original` ? calculations.original.rows : calculations.updated.rows;
  const years = [...new Set(rows.map((row) => parseDate(row.date).getFullYear()))];
  const select = $(`#scheduleYear`);
  const selected = String(state.filters.scheduleYear);
  select.innerHTML = `<option value="all">جميع السنوات</option>${years.map((year) => `<option value="${year}">${year}</option>`).join(``)}`;
  select.value = years.includes(Number(selected)) ? selected : `all`;
  state.filters.scheduleYear = select.value;
  $(`#scheduleSearch`).value = state.filters.scheduleSearch;
}

function getFilteredScheduleRows() {
  const schedule = state.filters.scheduleMode === `original` ? calculations.original : calculations.updated;
  const year = state.filters.scheduleYear;
  const search = state.filters.scheduleSearch.trim().toLowerCase();
  return schedule.rows.filter((row) => {
    const rowYear = String(parseDate(row.date).getFullYear());
    const matchesYear = year === `all` || rowYear === String(year);
    const haystack = `${row.installment} ${row.date} ${formatDate(row.date)} ${row.notes}`.toLowerCase();
    return matchesYear && (!search || haystack.includes(search));
  });
}

function renderSchedule() {
  const fullSchedule = state.filters.scheduleMode === `original` ? calculations.original : calculations.updated;
  const rows = getFilteredScheduleRows();
  const pageSize = Math.max(10, safeNumber(state.filters.schedulePageSize, 30));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.filters.schedulePage = Math.min(Math.max(1, safeNumber(state.filters.schedulePage, 1)), totalPages);
  const start = (state.filters.schedulePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const nextDate = calculations.nextRow?.date;

  $(`#scheduleBody`).innerHTML = pageRows.map((row) => {
    const isPast = compareDateKeys(row.date, calculations.currentDate) < 0;
    const isNext = row.date === nextDate && state.filters.scheduleMode === `updated`;
    const status = row.isFinal
      ? `<span class="status-tag final">السداد النهائي</span>`
      : row.extraPayment > 0
        ? `<span class="status-tag extra">دفعة إضافية</span>`
        : isNext
          ? `<span class="status-tag next">القسط القادم</span>`
          : isPast
            ? `<span class="status-tag">موعد منقضي</span>`
            : `<span class="status-tag">مجدول</span>`;
    const classes = [row.extraPayment > 0 ? `has-extra` : ``, row.isFinal ? `final-row` : ``, isPast ? `past-row` : ``].filter(Boolean).join(` `);
    return `
      <tr class="${classes}">
        <td>${formatNumber(row.installment)}</td>
        <td>${formatDate(row.date)}</td>
        <td>${formatMoney(row.payment)}</td>
        <td>${formatMoney(row.principal)}</td>
        <td>${formatMoney(row.interest)}</td>
        <td class="${row.extraPayment > 0 ? `amount-positive` : ``}">${row.extraPayment > 0 ? formatMoney(row.extraPayment) : `—`}</td>
        <td><strong>${formatMoney(row.remainingBalance)}</strong></td>
        <td class="note-cell">${escapeHtml(row.notes || `—`)}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join(``);

  $(`#scheduleSummary`).innerHTML = `
    <div><span>عدد الأقساط</span><strong>${formatNumber(fullSchedule.durationMonths)}</strong></div>
    <div><span>موعد السداد</span><strong>${formatDate(fullSchedule.payoffDate)}</strong></div>
    <div><span>إجمالي الفائدة</span><strong>${formatMoney(fullSchedule.totalInterest)}</strong></div>
    <div><span>إجمالي الأقساط</span><strong>${formatMoney(fullSchedule.totalRegularPayments)}</strong></div>
    <div><span>دفعات إضافية</span><strong>${formatMoney(fullSchedule.totalExtraApplied)}</strong></div>
  `;
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const current = state.filters.schedulePage;
  const pages = new Set([1, totalPages, current - 1, current, current + 1].filter((page) => page >= 1 && page <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  let previous = 0;
  const items = [];
  for (const page of sorted) {
    if (page - previous > 1) items.push(`<span>…</span>`);
    items.push(`<button type="button" class="${page === current ? `is-active` : ``}" data-schedule-page="${page}">${formatNumber(page)}</button>`);
    previous = page;
  }
  $(`#schedulePagination`).innerHTML = `
    <button type="button" data-schedule-page="${current - 1}" ${current === 1 ? `disabled` : ``}>→</button>
    ${items.join(``)}
    <button type="button" data-schedule-page="${current + 1}" ${current === totalPages ? `disabled` : ``}>←</button>
  `;
}

function renderTimeline() {
  const start = parseDate(state.loan.firstInstallmentDate);
  const end = parseDate(calculations.updated.payoffDate);
  const today = parseDate(calculations.currentDate);
  const totalMs = Math.max(1, end - start);
  const elapsed = Math.min(totalMs, Math.max(0, today - start));
  const progress = (elapsed / totalMs) * 100;
  $(`#timelineStart`).textContent = formatMonthYear(start);
  $(`#timelineEnd`).textContent = formatMonthYear(end);
  $(`#timelineFill`).style.width = `${progress}%`;
  $(`#timelineToday`).style.right = `${100 - progress}%`;
  $(`#timelineSavingPill`).textContent = calculations.monthsSaved
    ? `وفّرت ${pluralMonths(calculations.monthsSaved)}`
    : `الجدول الأصلي`;

  const markers = calculations.extraImpacts.map((payment) => {
    const paymentDate = parseDate(payment.date);
    const markerElapsed = Math.min(totalMs, Math.max(0, paymentDate - start));
    const markerProgress = (markerElapsed / totalMs) * 100;
    return `<span class="timeline-marker" style="right:${100 - markerProgress}%"><button type="button" aria-label="دفعة ${formatMoney(payment.amount)}"></button><span>${formatDate(payment.date)} · ${formatMoney(payment.amount)}</span></span>`;
  }).join(``);
  $(`#timelineMarkers`).innerHTML = markers;

  const yearGroups = new Map();
  calculations.updated.rows.forEach((row) => {
    const year = parseDate(row.date).getFullYear();
    if (!yearGroups.has(year)) yearGroups.set(year, []);
    yearGroups.get(year).push(row);
  });
  let cumulativePrincipal = 0;
  $(`#yearTimeline`).innerHTML = [...yearGroups.entries()].map(([year, rows]) => {
    const yearPrincipal = rows.reduce((sum, row) => sum + row.principal + row.extraPayment, 0);
    const yearInterest = rows.reduce((sum, row) => sum + row.interest, 0);
    const yearExtras = rows.filter((row) => row.extraPayment > 0);
    cumulativePrincipal += yearPrincipal;
    const percentage = Math.min(100, (cumulativePrincipal / state.loan.amount) * 100);
    return `
      <article class="year-card reveal">
        <div class="year-label"><strong>${year}</strong><span>${rows.length} قسط</span></div>
        <div>
          <div class="year-progress"><i style="width:${percentage}%"></i></div>
          ${yearExtras.length ? `<span class="extra-dot-list" title="${yearExtras.length} دفعات إضافية">${yearExtras.map(() => `<i></i>`).join(``)}</span>` : ``}
        </div>
        <div class="year-data"><strong>${formatMoney(yearPrincipal)}</strong><span>أصل مسدد · فائدة ${formatMoney(yearInterest)}</span></div>
      </article>
    `;
  }).join(``);
}

function renderReports() {
  const c = calculations;
  $(`#reportSummaryCard`).innerHTML = `
    <div class="card-heading"><div><span class="eyebrow">ملخص النسخة الحالية</span><h3>${escapeHtml(state.loan.name)}</h3></div><span class="status-pill positive">محفوظ محليًا</span></div>
    <div class="report-kpis">
      <div><span>أصل القرض</span><strong>${formatMoney(state.loan.amount)}</strong></div>
      <div><span>الرصيد الحالي</span><strong>${formatMoney(c.currentBalance)}</strong></div>
      <div><span>موعد السداد المحدّث</span><strong>${formatDate(c.updated.payoffDate)}</strong></div>
      <div><span>الفائدة الموفرة</span><strong>${formatMoney(c.interestSaved)}</strong></div>
    </div>
  `;
}

function renderSettings() {
  $(`#settingLoanAmount`).value = state.loan.amount;
  $(`#settingMonthlyPayment`).value = state.loan.monthlyPayment;
  $(`#settingAnnualRate`).value = state.loan.annualRate;
  $(`#settingTermMonths`).value = state.loan.termMonths;
  $(`#settingFirstDate`).value = state.loan.firstInstallmentDate;
  $(`#settingLoanName`).value = state.loan.name;
  $(`#settingAccentColor`).value = state.colors.accent;
  $(`#settingProgressColor`).value = state.colors.progress;
  $$(`[data-theme-choice]`).forEach((button) => button.classList.toggle(`is-active`, button.dataset.themeChoice === state.theme));
  renderSettingsValidation();
}

function renderSettingsValidation() {
  const banner = $(`#settingsValidation`);
  const payment = safeNumber($(`#settingMonthlyPayment`)?.value, state.loan.monthlyPayment);
  const amount = safeNumber($(`#settingLoanAmount`)?.value, state.loan.amount);
  const rate = safeNumber($(`#settingAnnualRate`)?.value, state.loan.annualRate) / 100 / 12;
  const firstInterest = amount * rate;
  if (payment <= firstInterest && rate > 0) {
    banner.className = `validation-banner`;
    banner.textContent = `القسط لا يغطي فائدة الشهر الأول؛ الرصيد سيزداد ولن ينتهي القرض بهذه القيم.`;
    return false;
  }
  const declaredDifference = calculations?.declaredDifference ?? 0;
  banner.className = `validation-banner is-valid`;
  banner.textContent = Math.abs(declaredDifference) > 0.01
    ? `القيم قابلة للحساب. ملاحظة: مجموع البنك المعلن يختلف عن نتيجة معادلة APR الشهرية بحوالي ${formatMoney(Math.abs(declaredDifference))} بسبب التقريب البنكي.`
    : `القيم سليمة، والمحرك قادر على إنشاء جدول سداد كامل.`;
  return true;
}

function applyTheme() {
  const systemDark = window.matchMedia?.(`(prefers-color-scheme: dark)`).matches;
  const resolved = state.theme === `system` ? (systemDark ? `dark` : `light`) : state.theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.setProperty(`--accent`, state.colors.accent);
  document.documentElement.style.setProperty(`--progress`, state.colors.progress);
  document.documentElement.style.setProperty(`--accent-rgb`, hexToRgb(state.colors.accent).join(`, `));
  const icon = resolved === `dark` ? `☀` : `◐`;
  $(`#themeIcon`).textContent = icon;
  $(`#mobileThemeToggle`).textContent = icon;
}

function hexToRgb(hex) {
  const normalized = String(hex).replace(`#`, ``).trim();
  const full = normalized.length === 3 ? normalized.split(``).map((char) => `${char}${char}`).join(``) : normalized.padEnd(6, `0`).slice(0, 6);
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) || 0);
}

function switchView(viewName, { save = true, updateHash = true } = {}) {
  const target = $(`[data-view-panel="${CSS.escape(viewName)}"]`);
  if (!target) return;
  $$(`[data-view-panel]`).forEach((panel) => panel.classList.toggle(`is-active`, panel === target));
  $$(`[data-view]`).forEach((button) => button.classList.toggle(`is-active`, button.dataset.view === viewName));
  state.lastView = viewName;
  if (save) saveState({ pulse: false });
  if (updateHash) history.replaceState(null, ``, `#${viewName}`);
  window.scrollTo({ top: 0, behavior: `smooth` });
  if (viewName === `schedule`) renderSchedule();
  if (viewName === `timeline`) renderTimeline();
}

function openExtraModal(paymentId = null) {
  const payment = paymentId ? state.extraPayments.find((item) => item.id === paymentId) : null;
  $(`#extraPaymentId`).value = payment?.id ?? ``;
  $(`#extraPaymentDate`).value = payment?.date ?? getSuggestedExtraDate();
  $(`#extraPaymentAmount`).value = payment?.amount ?? ``;
  $(`#extraPaymentNote`).value = payment?.note ?? ``;
  $(`#extraModalTitle`).textContent = payment ? `تعديل الدفعة` : `إضافة دفعة تحت الحساب`;
  updateModalPreview();
  toggleModal($(`#extraPaymentModal`), true);
  window.setTimeout(() => $(`#extraPaymentAmount`).focus(), 180);
}

function getSuggestedExtraDate() {
  const today = parseDate(todayKey());
  const first = parseDate(state.loan.firstInstallmentDate);
  return dateToKey(today < first ? first : today);
}

function updateModalPreview() {
  const preview = calculatePreviewPayment({
    date: $(`#extraPaymentDate`).value,
    amount: safeNumber($(`#extraPaymentAmount`).value),
    note: $(`#extraPaymentNote`).value
  }, $(`#extraPaymentId`).value || null);
  $(`#modalPaymentPreview`).innerHTML = `<div class="preview-grid">${previewMarkup(preview)}</div>`;
}

function toggleModal(modal, open) {
  modal.classList.toggle(`is-open`, open);
  modal.setAttribute(`aria-hidden`, String(!open));
  document.body.style.overflow = open ? `hidden` : ``;
}

function showToast(title, message, type = `success`) {
  const id = cryptoRandomId();
  const toast = document.createElement(`div`);
  toast.className = `toast ${type}`;
  toast.dataset.toastId = id;
  toast.innerHTML = `
    <span class="toast-icon">${type === `success` ? `✓` : `!`}</span>
    <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
    <button class="toast-close" type="button" aria-label="إغلاق">×</button>
  `;
  $(`#toastRegion`).append(toast);
  const remove = () => toast.remove();
  $(`.toast-close`, toast).addEventListener(`click`, remove);
  window.setTimeout(remove, 5200);
}

function confirmAction({ title, message, confirmText = `تأكيد`, phrase = null, danger = true }) {
  return new Promise((resolve) => {
    confirmationResolver = resolve;
    $(`#confirmTitle`).textContent = title;
    $(`#confirmMessage`).textContent = message;
    $(`#confirmAccept`).textContent = confirmText;
    $(`#confirmAccept`).className = danger ? `danger-button` : `primary-button`;
    const wrap = $(`#confirmPhraseWrap`);
    wrap.classList.toggle(`hidden`, !phrase);
    $(`#confirmPhraseLabel`).textContent = phrase ?? ``;
    $(`#confirmPhraseInput`).value = ``;
    $(`#confirmModal`).dataset.phrase = phrase ?? ``;
    toggleModal($(`#confirmModal`), true);
  });
}

function resolveConfirmation(accepted) {
  if (accepted) {
    const phrase = $(`#confirmModal`).dataset.phrase;
    if (phrase && $(`#confirmPhraseInput`).value.trim() !== phrase) {
      showToast(`النص غير مطابق`, `اكتب عبارة التأكيد كما تظهر تمامًا.`, `error`);
      return;
    }
  }
  toggleModal($(`#confirmModal`), false);
  confirmationResolver?.(accepted);
  confirmationResolver = null;
}

function handleExtraPaymentSubmit(event) {
  event.preventDefault();
  const id = $(`#extraPaymentId`).value;
  const date = $(`#extraPaymentDate`).value;
  const amount = safeNumber($(`#extraPaymentAmount`).value);
  const note = $(`#extraPaymentNote`).value.trim();
  if (!parseDate(date)) {
    showToast(`تاريخ غير صالح`, `اختر تاريخًا صحيحًا للدفعة.`, `error`);
    return;
  }
  if (amount <= 0) {
    showToast(`قيمة غير صالحة`, `أدخل قيمة أكبر من صفر.`, `error`);
    return;
  }
  const preview = calculatePreviewPayment({ date, amount, note }, id || null);
  if (!preview.valid) {
    showToast(`لا يوجد أثر`, `هذا التاريخ يقع بعد انتهاء القرض أو أن الرصيد مسدد بالكامل.`, `error`);
    return;
  }
  if (id) {
    const index = state.extraPayments.findIndex((item) => item.id === id);
    if (index >= 0) state.extraPayments[index] = { ...state.extraPayments[index], date, amount, note };
  } else {
    state.extraPayments.push({ id: cryptoRandomId(), date, amount, note, createdAt: new Date().toISOString() });
  }
  saveState();
  toggleModal($(`#extraPaymentModal`), false);
  renderAll();
  showToast(`تم تسجيل الدفعة`, `تم تقليل مدة القرض بنجاح.`, `success`);
}

async function deleteExtraPayment(id) {
  const payment = state.extraPayments.find((item) => item.id === id);
  if (!payment) return;
  const confirmed = await confirmAction({
    title: `حذف الدفعة`,
    message: `سيتم حذف دفعة بقيمة ${formatMoney(payment.amount)} وإعادة احتساب الجدول بالكامل.`,
    confirmText: `حذف الدفعة`
  });
  if (!confirmed) return;
  state.extraPayments = state.extraPayments.filter((item) => item.id !== id);
  saveState();
  renderAll();
  showToast(`تم حذف الدفعة`, `أُعيد احتساب مدة القرض والفائدة.`, `success`);
}

function saveSimulatorPayment() {
  const date = $(`#simulatorDate`).value;
  const amount = safeNumber($(`#simulatorAmount`).value);
  const note = $(`#simulatorNote`).value.trim();
  const preview = calculatePreviewPayment({ date, amount, note });
  if (!preview.valid) {
    showToast(`تعذر تسجيل الدفعة`, `تحقق من التاريخ والقيمة وأن القرض لم يُسدد قبل هذا التاريخ.`, `error`);
    return;
  }
  state.extraPayments.push({ id: cryptoRandomId(), date, amount, note, createdAt: new Date().toISOString() });
  $(`#simulatorAmount`).value = ``;
  $(`#simulatorNote`).value = ``;
  saveState();
  renderAll();
  showToast(`تم تسجيل الدفعة`, `تم تقليل مدة القرض بنجاح.`, `success`);
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  if (!renderSettingsValidation()) {
    showToast(`إعدادات غير قابلة للسداد`, `ارفع قيمة القسط أو خفّض الفائدة.`, `error`);
    return;
  }
  const firstDate = $(`#settingFirstDate`).value;
  if (!parseDate(firstDate)) {
    showToast(`تاريخ غير صالح`, `تحقق من تاريخ أول قسط.`, `error`);
    return;
  }
  state.loan = {
    ...state.loan,
    name: $(`#settingLoanName`).value.trim() || DEFAULT_STATE.loan.name,
    amount: safeNumber($(`#settingLoanAmount`).value),
    monthlyPayment: safeNumber($(`#settingMonthlyPayment`).value),
    annualRate: safeNumber($(`#settingAnnualRate`).value),
    termMonths: Math.max(1, Math.round(safeNumber($(`#settingTermMonths`).value))),
    firstInstallmentDate: firstDate
  };
  saveState();
  renderAll();
  showToast(`تم تحديث القرض`, `أُعيد إنشاء الجدول وفق القيم الجديدة.`, `success`);
}

async function resetApplication() {
  const confirmed = await confirmAction({
    title: `إعادة ضبط كل البيانات`,
    message: `سيتم حذف الدفعات الإضافية والإعدادات والملاحظات المحفوظة على هذا الجهاز. لا يمكن التراجع بعد التنفيذ.`,
    confirmText: `إعادة الضبط`,
    phrase: `إعادة`
  });
  if (!confirmed) return;
  state = clone(DEFAULT_STATE);
  saveState();
  renderAll();
  switchView(`dashboard`);
  showToast(`تمت إعادة الضبط`, `عادت بيانات القرض الأساسية بنجاح.`, `success`);
}

function exportCsv(rows, filename) {
  const headers = [`رقم القسط`, `تاريخ القسط`, `القسط الشهري`, `أصل الدين`, `الفائدة`, `دفعة إضافية`, `الرصيد المتبقي`, `الملاحظات`, `الحالة`];
  const data = rows.map((row) => [
    row.installment,
    row.date,
    row.payment.toFixed(3),
    row.principal.toFixed(3),
    row.interest.toFixed(3),
    row.extraPayment.toFixed(3),
    row.remainingBalance.toFixed(3),
    row.notes,
    row.isFinal ? `السداد النهائي` : row.extraPayment > 0 ? `دفعة إضافية` : `مجدول`
  ]);
  const csv = `\uFEFF${[headers, ...data].map((row) => row.map(csvEscape).join(`,`)).join(`\r\n`)}`;
  downloadBlob(new Blob([csv], { type: `text/csv;charset=utf-8` }), filename);
}

function exportExtraPaymentsCsv() {
  const headers = [`التاريخ`, `المبلغ`, `الملاحظة`, `الرصيد قبل`, `الرصيد بعد`, `الفائدة الموفرة`, `الأشهر الموفرة`];
  const rows = calculations.extraImpacts.map((payment) => [
    payment.date,
    payment.amount.toFixed(3),
    payment.note,
    payment.balanceBefore.toFixed(3),
    payment.balanceAfter.toFixed(3),
    payment.incrementalInterestSaved.toFixed(3),
    payment.incrementalMonthsSaved
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvEscape).join(`,`)).join(`\r\n`)}`;
  downloadBlob(new Blob([csv], { type: `text/csv;charset=utf-8` }), `دفعات-تحت-الحساب.csv`);
}

function csvEscape(value) {
  const text = String(value ?? ``).replace(/"/g, `""`);
  return `"${text}"`;
}

function exportExcelReport(schedule = calculations.updated, filename = `تقرير-القرض.xls`) {
  const summaryRows = [
    [`اسم القرض`, state.loan.name],
    [`مبلغ القرض`, state.loan.amount.toFixed(3)],
    [`القسط الشهري`, state.loan.monthlyPayment.toFixed(3)],
    [`الفائدة السنوية`, `${state.loan.annualRate.toFixed(4)}%`],
    [`تاريخ أول قسط`, state.loan.firstInstallmentDate],
    [`موعد السداد الأصلي`, calculations.original.payoffDate],
    [`موعد السداد المحدّث`, calculations.updated.payoffDate],
    [`الأشهر الموفرة`, calculations.monthsSaved],
    [`الفائدة الموفرة`, calculations.interestSaved.toFixed(3)]
  ];
  const scheduleRows = schedule.rows.map((row) => `
    <tr>
      <td>${row.installment}</td><td>${row.date}</td><td>${row.payment.toFixed(3)}</td><td>${row.principal.toFixed(3)}</td>
      <td>${row.interest.toFixed(3)}</td><td>${row.extraPayment.toFixed(3)}</td><td>${row.remainingBalance.toFixed(3)}</td>
      <td>${escapeHtml(row.notes)}</td><td>${row.isFinal ? `السداد النهائي` : row.extraPayment > 0 ? `دفعة إضافية` : `مجدول`}</td>
    </tr>
  `).join(``);
  const extraRows = calculations.extraImpacts.map((payment) => `
    <tr><td>${payment.date}</td><td>${payment.amount.toFixed(3)}</td><td>${escapeHtml(payment.note)}</td><td>${payment.balanceBefore.toFixed(3)}</td><td>${payment.balanceAfter.toFixed(3)}</td><td>${payment.incrementalInterestSaved.toFixed(3)}</td><td>${payment.incrementalMonthsSaved}</td></tr>
  `).join(``);
  const html = `
    <html dir="rtl"><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;direction:rtl} table{border-collapse:collapse;width:100%;margin-bottom:20px} th,td{border:1px solid #aaa;padding:7px;text-align:right} th{background:#dfeeee;color:#164b4b} h1,h2{color:#087f7f}
    </style></head><body>
      <h1>${escapeHtml(state.loan.name)}</h1>
      <h2>ملخص القرض</h2><table>${summaryRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join(``)}</table>
      <h2>دفعات تحت الحساب</h2><table><tr><th>التاريخ</th><th>المبلغ</th><th>الملاحظة</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>الفائدة الموفرة</th><th>الأشهر الموفرة</th></tr>${extraRows || `<tr><td colspan="7">لا توجد دفعات إضافية</td></tr>`}</table>
      <h2>جدول الإطفاء</h2><table><tr><th>#</th><th>التاريخ</th><th>القسط</th><th>الأصل</th><th>الفائدة</th><th>دفعة إضافية</th><th>الرصيد</th><th>الملاحظات</th><th>الحالة</th></tr>${scheduleRows}</table>
    </body></html>
  `;
  downloadBlob(new Blob([`\uFEFF`, html], { type: `application/vnd.ms-excel;charset=utf-8` }), filename);
}

function backupJson() {
  const backup = {
    app: `Premium Loan Tracker`,
    exportedAt: new Date().toISOString(),
    data: state
  };
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: `application/json;charset=utf-8` }), `loan-tracker-backup-${todayKey()}.json`);
}

async function restoreJson(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = parsed?.data ?? parsed;
    if (!imported?.loan || !Array.isArray(imported?.extraPayments)) throw new Error(`Invalid backup`);
    const confirmed = await confirmAction({
      title: `استعادة النسخة الاحتياطية`,
      message: `سيتم استبدال البيانات الحالية بالكامل بمحتوى الملف المحدد.`,
      confirmText: `استعادة البيانات`,
      danger: false
    });
    if (!confirmed) return;
    state = mergeState(DEFAULT_STATE, imported);
    saveState();
    renderAll();
    switchView(state.lastView || `dashboard`);
    showToast(`تمت الاستعادة`, `تم تحميل بيانات النسخة الاحتياطية بنجاح.`, `success`);
  } catch (error) {
    console.error(error);
    showToast(`ملف غير صالح`, `تعذر قراءة النسخة الاحتياطية أو أن بنيتها غير معروفة.`, `error`);
  } finally {
    $(`#restoreJsonInput`).value = ``;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement(`a`);
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function preparePrintReport() {
  document.querySelectorAll(`.print-report`).forEach((element) => element.remove());
  const fragment = $(`#printReportTemplate`).content.cloneNode(true);
  const report = $(`.print-report`, fragment);
  const c = calculations;
  $(`#printSummary`, fragment).innerHTML = `
    <div class="print-summary-grid">
      <div><span>مبلغ القرض</span><strong>${formatMoney(state.loan.amount)}</strong></div>
      <div><span>القسط الشهري</span><strong>${formatMoney(state.loan.monthlyPayment)}</strong></div>
      <div><span>الفائدة السنوية</span><strong>${state.loan.annualRate.toFixed(4)}%</strong></div>
      <div><span>تاريخ أول قسط</span><strong>${formatDate(state.loan.firstInstallmentDate)}</strong></div>
      <div><span>السداد الأصلي</span><strong>${formatDate(c.original.payoffDate)}</strong></div>
      <div><span>السداد المحدّث</span><strong>${formatDate(c.updated.payoffDate)}</strong></div>
      <div><span>الأشهر الموفرة</span><strong>${pluralMonths(c.monthsSaved)}</strong></div>
      <div><span>الفائدة الموفرة</span><strong>${formatMoney(c.interestSaved)}</strong></div>
    </div>
  `;
  $(`#printExtraPayments`, fragment).innerHTML = `
    <h2>دفعات تحت الحساب</h2>
    <table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الملاحظة</th><th>الرصيد قبل</th><th>الرصيد بعد</th><th>الفائدة الموفرة</th><th>الأشهر الموفرة</th></tr></thead><tbody>
      ${c.extraImpacts.length ? c.extraImpacts.map((payment) => `<tr><td>${formatShortDate(payment.date)}</td><td>${formatMoney(payment.amount)}</td><td>${escapeHtml(payment.note || `—`)}</td><td>${formatMoney(payment.balanceBefore)}</td><td>${formatMoney(payment.balanceAfter)}</td><td>${formatMoney(payment.incrementalInterestSaved)}</td><td>${pluralMonths(payment.incrementalMonthsSaved)}</td></tr>`).join(``) : `<tr><td colspan="7">لا توجد دفعات إضافية</td></tr>`}
    </tbody></table>
  `;
  $(`#printScheduleTable`, fragment).innerHTML = `
    <h2>جدول إطفاء القرض المحدّث</h2>
    <table><thead><tr><th>#</th><th>التاريخ</th><th>القسط</th><th>الأصل</th><th>الفائدة</th><th>إضافي</th><th>الرصيد</th><th>الملاحظات</th></tr></thead><tbody>
      ${c.updated.rows.map((row) => `<tr><td>${row.installment}</td><td>${formatShortDate(row.date)}</td><td>${formatMoney(row.payment)}</td><td>${formatMoney(row.principal)}</td><td>${formatMoney(row.interest)}</td><td>${row.extraPayment ? formatMoney(row.extraPayment) : `—`}</td><td>${formatMoney(row.remainingBalance)}</td><td>${escapeHtml(row.notes || `—`)}</td></tr>`).join(``)}
    </tbody></table>
  `;
  document.body.append(report);
  window.print();
  window.setTimeout(() => report.remove(), 1200);
}

function animateTextNumber(element, target, formatter) {
  if (!element) return;
  const startValue = safeNumber(element.dataset.numericValue, 0);
  const endValue = safeNumber(target, 0);
  const duration = 700;
  const startTime = performance.now();
  const existingFrame = numberAnimationFrames.get(element);
  if (existingFrame) cancelAnimationFrame(existingFrame);
  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = startValue + (endValue - startValue) * eased;
    element.textContent = formatter(value);
    if (progress < 1) {
      numberAnimationFrames.set(element, requestAnimationFrame(tick));
    } else {
      element.dataset.numericValue = String(endValue);
      numberAnimationFrames.delete(element);
    }
  };
  numberAnimationFrames.set(element, requestAnimationFrame(tick));
}

function escapeHtml(value) {
  return String(value ?? ``)
    .replace(/&/g, `&amp;`)
    .replace(/</g, `&lt;`)
    .replace(/>/g, `&gt;`)
    .replace(/"/g, `&quot;`)
    .replace(/'/g, `&#039;`);
}

function toggleThemeQuickly() {
  const currentResolved = document.documentElement.dataset.theme;
  state.theme = currentResolved === `dark` ? `light` : `dark`;
  saveState();
  applyTheme();
  renderSettings();
}

function bindEvents() {
  document.addEventListener(`click`, (event) => {
    const viewButton = event.target.closest(`[data-view]`);
    if (viewButton) switchView(viewButton.dataset.view);

    const goView = event.target.closest(`[data-go-view]`);
    if (goView) switchView(goView.dataset.goView);

    const viewLink = event.target.closest(`[data-view-link]`);
    if (viewLink) {
      event.preventDefault();
      switchView(viewLink.dataset.viewLink);
    }

    if (event.target.closest(`[data-open-extra-modal]`)) openExtraModal();
    if (event.target.closest(`[data-close-modal]`)) toggleModal($(`#extraPaymentModal`), false);

    const edit = event.target.closest(`[data-edit-extra]`);
    if (edit) openExtraModal(edit.dataset.editExtra);

    const remove = event.target.closest(`[data-delete-extra]`);
    if (remove) deleteExtraPayment(remove.dataset.deleteExtra);

    const pageButton = event.target.closest(`[data-schedule-page]`);
    if (pageButton && !pageButton.disabled) {
      state.filters.schedulePage = safeNumber(pageButton.dataset.schedulePage, 1);
      saveState({ pulse: false });
      renderSchedule();
      $(`.schedule-table-wrap`).scrollTo({ top: 0, behavior: `smooth` });
    }
  });

  $(`#themeToggle`).addEventListener(`click`, toggleThemeQuickly);
  $(`#mobileThemeToggle`).addEventListener(`click`, toggleThemeQuickly);
  $(`#extraPaymentForm`).addEventListener(`submit`, handleExtraPaymentSubmit);
  [`input`, `change`].forEach((eventName) => {
    $(`#extraPaymentDate`).addEventListener(eventName, updateModalPreview);
    $(`#extraPaymentAmount`).addEventListener(eventName, updateModalPreview);
    $(`#extraPaymentNote`).addEventListener(eventName, updateModalPreview);
    $(`#simulatorDate`).addEventListener(eventName, renderSimulator);
    $(`#simulatorAmount`).addEventListener(eventName, renderSimulator);
    $(`#simulatorNote`).addEventListener(eventName, renderSimulator);
  });
  $(`#saveSimulatorPayment`).addEventListener(`click`, saveSimulatorPayment);
  $(`#exportExtraCsv`).addEventListener(`click`, exportExtraPaymentsCsv);

  $(`#scheduleMode`).addEventListener(`click`, (event) => {
    const button = event.target.closest(`[data-mode]`);
    if (!button) return;
    state.filters.scheduleMode = button.dataset.mode;
    state.filters.schedulePage = 1;
    renderScheduleControls();
    renderSchedule();
    saveState({ pulse: false });
  });
  $(`#scheduleYear`).addEventListener(`change`, (event) => {
    state.filters.scheduleYear = event.target.value;
    state.filters.schedulePage = 1;
    renderSchedule();
    saveState({ pulse: false });
  });
  $(`#scheduleSearch`).addEventListener(`input`, (event) => {
    state.filters.scheduleSearch = event.target.value;
    state.filters.schedulePage = 1;
    renderSchedule();
    saveState({ pulse: false });
  });
  $(`#exportScheduleCsv`).addEventListener(`click`, () => exportCsv(getFilteredScheduleRows(), `جدول-القرض.csv`));
  $(`#exportScheduleExcel`).addEventListener(`click`, () => exportExcelReport(state.filters.scheduleMode === `original` ? calculations.original : calculations.updated));
  $(`#printSchedule`).addEventListener(`click`, preparePrintReport);

  $(`#reportCsv`).addEventListener(`click`, () => exportCsv(calculations.updated.rows, `جدول-القرض-المحدث.csv`));
  $(`#reportExcel`).addEventListener(`click`, () => exportExcelReport());
  $(`#reportPrint`).addEventListener(`click`, preparePrintReport);
  $(`#backupJson`).addEventListener(`click`, backupJson);
  $(`#restoreJsonButton`).addEventListener(`click`, () => $(`#restoreJsonInput`).click());
  $(`#restoreJsonInput`).addEventListener(`change`, (event) => {
    const file = event.target.files?.[0];
    if (file) restoreJson(file);
  });

  $(`#settingsForm`).addEventListener(`submit`, handleSettingsSubmit);
  [`input`, `change`].forEach((eventName) => {
    [`#settingLoanAmount`, `#settingMonthlyPayment`, `#settingAnnualRate`, `#settingTermMonths`].forEach((selector) => {
      $(selector).addEventListener(eventName, renderSettingsValidation);
    });
  });
  $$(`[data-theme-choice]`).forEach((button) => button.addEventListener(`click`, () => {
    state.theme = button.dataset.themeChoice;
    saveState();
    applyTheme();
    renderSettings();
  }));
  $(`#settingAccentColor`).addEventListener(`input`, (event) => {
    state.colors.accent = event.target.value;
    applyTheme();
    saveState();
  });
  $(`#settingProgressColor`).addEventListener(`input`, (event) => {
    state.colors.progress = event.target.value;
    applyTheme();
    saveState();
  });
  $(`#restoreDefaultColors`).addEventListener(`click`, () => {
    state.colors = clone(DEFAULT_STATE.colors);
    saveState();
    renderAll();
    showToast(`تمت استعادة الألوان`, `عادت الهوية البصرية الافتراضية.`, `success`);
  });
  $(`#resetApp`).addEventListener(`click`, resetApplication);

  $(`#confirmCancel`).addEventListener(`click`, () => resolveConfirmation(false));
  $(`#confirmAccept`).addEventListener(`click`, () => resolveConfirmation(true));
  $(`#confirmModal`).addEventListener(`click`, (event) => {
    if (event.target === $(`#confirmModal`)) resolveConfirmation(false);
  });
  $(`#extraPaymentModal`).addEventListener(`click`, (event) => {
    if (event.target === $(`#extraPaymentModal`)) toggleModal($(`#extraPaymentModal`), false);
  });
  document.addEventListener(`keydown`, (event) => {
    if (event.key !== `Escape`) return;
    if ($(`#extraPaymentModal`).classList.contains(`is-open`)) toggleModal($(`#extraPaymentModal`), false);
    if ($(`#confirmModal`).classList.contains(`is-open`)) resolveConfirmation(false);
  });

  window.matchMedia?.(`(prefers-color-scheme: dark)`).addEventListener?.(`change`, () => {
    if (state.theme === `system`) applyTheme();
  });
}

function initialize() {
  bindEvents();
  renderAll();
  const hashView = location.hash.replace(`#`, ``);
  const initialView = $(`[data-view-panel="${CSS.escape(hashView)}"]`) ? hashView : state.lastView;
  switchView(initialView || `dashboard`, { save: false, updateHash: true });
}

document.addEventListener(`DOMContentLoaded`, initialize);
