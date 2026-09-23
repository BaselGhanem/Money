(() => {
  `use strict`;

  const STORAGE_KEY = `basel.loan.cinematic.v1`;
  const DATE_LOCALE = `en-GB`;
  const EPS = 0.000001;

  const BANK_DEFAULTS = Object.freeze({
    version: 1,
    loan: {
      name: `قرض البنك العربي`,
      amount: 51000,
      annualRate: 6.1,
      monthlyPayment: 436,
      agreementDate: `2026-07-09`,
      firstInstallmentDate: `2026-08-05`,
      bankInstallmentCount: 176,
      declaredTotalPayments: 77255.12,
      declaredTotalInterest: 26255.12
    },
    extraPayments: [
      {
        id: `bank-extra-20260826`,
        date: `2026-08-26`,
        amount: 700,
        note: `دفعة إضافية فعلية حسب كشف البنك بتاريخ 23/09/2026`,
        source: `bank-statement`,
        createdAt: `2026-08-26T12:00:00.000Z`
      }
    ],
    lastView: `home`,
    updatedAt: `2026-09-24T00:00:00.000Z`
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {};
  let state = loadState();
  let calculations = null;
  let pendingSimulation = null;
  let confirmResolver = null;
  let toastTimer = null;

  document.addEventListener(`DOMContentLoaded`, init);

  function init() {
    cacheElements();
    bindEvents();
    hydrateSettings();
    setDefaultDates();
    navigate(state.lastView || `home`, false);
    recalculate();
  }

  function cacheElements() {
    [
      `settingsButton`, `currentBalance`, `balanceCaption`, `progressBar`, `progressRing`, `progressPct`, `nextPayment`, `currentPayoff`,
      `remainingInterest`, `progressInline`, `extraPaidTotal`, `monthsSaved`, `baselinePayoff`, `impactCurrentPayoff`, `interestSaved`,
      `openAddPaymentHome`, `recentPaymentCard`, `paymentsTotal`, `openAddPaymentPayments`, `paymentCount`, `paymentsList`,
      `simulationForm`, `simulationAmount`, `simulationDate`, `simulationResults`, `simCurrentPayoff`, `simNewPayoff`, `simMonthsSaved`,
      `simInterestSaved`, `commitSimulation`, `clearSimulation`, `scheduleYear`, `scheduleSearch`, `exportSchedule`, `scheduleRows`,
      `scheduleInterestTotal`, `schedulePayoffDate`, `paymentSheet`, `paymentForm`, `paymentId`, `paymentAmount`, `paymentDate`, `paymentNote`,
      `paymentPreview`, `paymentSubmitText`, `settingsSheet`, `settingsForm`, `settingAmount`, `settingPayment`, `settingRate`, `settingAgreementDate`,
      `settingFirstDate`, `settingTerm`, `exportBackup`, `resetBankData`, `confirmDialog`, `confirmTitle`, `confirmMessage`, `confirmCancel`, `confirmAccept`, `toast`
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    $$(`[data-nav]`).forEach((button) => button.addEventListener(`click`, () => navigate(button.dataset.nav)));
    $$(`[data-nav-target]`).forEach((button) => button.addEventListener(`click`, () => navigate(button.dataset.navTarget)));

    els.settingsButton.addEventListener(`click`, openSettings);
    els.openAddPaymentHome.addEventListener(`click`, () => openPaymentSheet());
    els.openAddPaymentPayments.addEventListener(`click`, () => openPaymentSheet());

    $$(`[data-close-sheet="payment"]`).forEach((button) => button.addEventListener(`click`, closePaymentSheet));
    $$(`[data-close-sheet="settings"]`).forEach((button) => button.addEventListener(`click`, closeSettings));

    els.paymentSheet.addEventListener(`click`, (event) => { if (event.target === els.paymentSheet) closePaymentSheet(); });
    els.settingsSheet.addEventListener(`click`, (event) => { if (event.target === els.settingsSheet) closeSettings(); });

    els.paymentForm.addEventListener(`submit`, handlePaymentSubmit);
    els.paymentAmount.addEventListener(`input`, renderPaymentPreview);
    els.paymentDate.addEventListener(`change`, renderPaymentPreview);

    els.paymentsList.addEventListener(`click`, handlePaymentAction);
    els.simulationForm.addEventListener(`submit`, handleSimulation);
    els.commitSimulation.addEventListener(`click`, commitSimulationAsPayment);
    els.clearSimulation.addEventListener(`click`, clearSimulation);

    els.scheduleYear.addEventListener(`change`, renderSchedule);
    els.scheduleSearch.addEventListener(`input`, renderSchedule);
    els.exportSchedule.addEventListener(`click`, exportScheduleCSV);

    els.settingsForm.addEventListener(`submit`, handleSettingsSubmit);
    els.exportBackup.addEventListener(`click`, exportBackup);
    els.resetBankData.addEventListener(`click`, requestReset);

    els.confirmCancel.addEventListener(`click`, () => resolveConfirm(false));
    els.confirmAccept.addEventListener(`click`, () => resolveConfirm(true));
    els.confirmDialog.addEventListener(`click`, (event) => { if (event.target === els.confirmDialog) resolveConfirm(false); });

    document.addEventListener(`keydown`, (event) => {
      if (event.key !== `Escape`) return;
      if (els.paymentSheet.classList.contains(`is-open`)) closePaymentSheet();
      if (els.settingsSheet.classList.contains(`is-open`)) closeSettings();
      if (els.confirmDialog.classList.contains(`is-open`)) resolveConfirm(false);
    });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(raw) {
    const base = clone(BANK_DEFAULTS);
    const input = raw && typeof raw === `object` ? raw : {};
    return {
      ...base,
      ...input,
      loan: { ...base.loan, ...(input.loan || {}) },
      extraPayments: Array.isArray(input.extraPayments) ? input.extraPayments.map(normalizePayment).filter((item) => item.amount > 0) : base.extraPayments.map(normalizePayment)
    };
  }

  function normalizePayment(payment) {
    return {
      id: String(payment?.id || createId()),
      date: validDate(payment?.date) ? payment.date : BANK_DEFAULTS.loan.firstInstallmentDate,
      amount: round2(Math.max(0, num(payment?.amount))),
      note: String(payment?.note || ``).trim().slice(0, 120),
      source: payment?.source || `manual`,
      createdAt: payment?.createdAt || new Date().toISOString()
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : clone(BANK_DEFAULTS);
    } catch (error) {
      console.error(`Failed to load local state`, error);
      return clone(BANK_DEFAULTS);
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function recalculate() {
    calculations = calculateAll(state.loan, state.extraPayments);
    renderAll();
  }

  function calculateAll(loan, extras) {
    const baseline = generateSchedule(loan, []);
    const current = generateSchedule(loan, extras);
    const snapshot = currentSnapshot(current, todayKey());
    return {
      baseline,
      current,
      snapshot,
      totalExtra: round2(extras.reduce((sum, item) => sum + item.amount, 0)),
      monthsSaved: monthDifference(current.payoffDate, baseline.payoffDate),
      interestSaved: round2(baseline.totalInterest - current.totalInterest)
    };
  }

  function generateSchedule(loanInput, extraPayments = []) {
    const loan = validateLoan(loanInput);
    const extras = extraPayments.map(normalizePayment).sort((a, b) => compareDates(a.date, b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const annualRate = loan.annualRate / 100;
    let balance = round2(loan.amount);
    let totalInterest = 0;
    let totalRegular = 0;
    let totalExtra = 0;
    let previousDue = loan.agreementDate;
    let extraIndex = 0;
    const rows = [];
    const maxRows = 900;

    for (let installment = 1; balance > EPS && installment <= maxRows; installment += 1) {
      const dueDate = addMonths(loan.firstInstallmentDate, installment - 1);
      const openingBalance = balance;
      let interestRaw = 0;
      let cursor = previousDue;
      let rowExtra = 0;
      const rowExtraIds = [];

      while (extraIndex < extras.length && compareDates(extras[extraIndex].date, dueDate) < 0) {
        const extra = extras[extraIndex];
        if (compareDates(extra.date, previousDue) > 0) {
          interestRaw += balance * annualRate * (daysBetween(cursor, extra.date) / 360);
          cursor = extra.date;
          const applied = round2(Math.min(extra.amount, balance));
          balance = round2(balance - applied);
          totalExtra = round2(totalExtra + applied);
          rowExtra = round2(rowExtra + applied);
          rowExtraIds.push(extra.id);
        }
        extraIndex += 1;
      }

      if (balance <= EPS) {
        rows.push({
          number: installment,
          date: cursor,
          openingBalance,
          installment: 0,
          principal: 0,
          interest: 0,
          extraPayment: rowExtra,
          closingBalance: 0,
          extraIds: rowExtraIds,
          isFinal: true
        });
        break;
      }

      interestRaw += balance * annualRate * (daysBetween(cursor, dueDate) / 360);
      const interest = round2(interestRaw);
      const installmentAmount = round2(Math.min(loan.monthlyPayment, balance + interest));
      const principal = round2(Math.max(0, installmentAmount - interest));
      balance = round2(Math.max(0, balance - principal));
      totalInterest = round2(totalInterest + interest);
      totalRegular = round2(totalRegular + installmentAmount);

      while (extraIndex < extras.length && compareDates(extras[extraIndex].date, dueDate) === 0) {
        const extra = extras[extraIndex];
        const applied = round2(Math.min(extra.amount, balance));
        balance = round2(Math.max(0, balance - applied));
        totalExtra = round2(totalExtra + applied);
        rowExtra = round2(rowExtra + applied);
        rowExtraIds.push(extra.id);
        extraIndex += 1;
      }

      rows.push({
        number: installment,
        date: dueDate,
        openingBalance,
        installment: installmentAmount,
        principal,
        interest,
        extraPayment: rowExtra,
        closingBalance: balance,
        extraIds: rowExtraIds,
        isFinal: balance <= EPS
      });
      previousDue = dueDate;
    }

    return {
      rows,
      payoffDate: rows.at(-1)?.date || loan.firstInstallmentDate,
      totalInterest: round2(totalInterest),
      totalRegularPayments: round2(totalRegular),
      totalExtraPayments: round2(totalExtra),
      totalPayments: round2(totalRegular + totalExtra),
      loan
    };
  }

  function currentSnapshot(schedule, today) {
    const paidRows = schedule.rows.filter((row) => compareDates(row.date, today) <= 0);
    const futureRows = schedule.rows.filter((row) => compareDates(row.date, today) > 0 && row.closingBalance > EPS);
    const lastPaid = paidRows.at(-1);
    const lastDueDate = lastPaid?.date || schedule.loan.agreementDate;
    const balanceAfterLastDue = lastPaid ? lastPaid.closingBalance : schedule.loan.amount;
    const extraSinceLastDue = state.extraPayments
      .filter((payment) => compareDates(payment.date, lastDueDate) > 0 && compareDates(payment.date, today) <= 0)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const currentBalance = round2(Math.max(0, balanceAfterLastDue - extraSinceLastDue));
    const interestPaid = round2(paidRows.reduce((sum, row) => sum + row.interest, 0));
    const principalPaid = round2(schedule.loan.amount - currentBalance);
    return {
      currentBalance,
      principalPaid,
      interestPaid,
      remainingInterest: round2(Math.max(0, schedule.totalInterest - interestPaid)),
      progress: schedule.loan.amount > 0 ? Math.max(0, Math.min(100, principalPaid / schedule.loan.amount * 100)) : 0,
      nextPaymentDate: futureRows[0]?.date || null,
      nextInstallment: futureRows[0]?.installment || 0
    };
  }

  function validateLoan(input) {
    return {
      ...input,
      amount: Math.max(1, num(input.amount)),
      annualRate: Math.max(0, num(input.annualRate)),
      monthlyPayment: Math.max(1, num(input.monthlyPayment)),
      agreementDate: validDate(input.agreementDate) ? input.agreementDate : BANK_DEFAULTS.loan.agreementDate,
      firstInstallmentDate: validDate(input.firstInstallmentDate) ? input.firstInstallmentDate : BANK_DEFAULTS.loan.firstInstallmentDate,
      bankInstallmentCount: Math.max(1, Math.round(num(input.bankInstallmentCount)))
    };
  }

  function renderAll() {
    renderHome();
    renderPayments();
    renderScheduleFilters();
    renderSchedule();
    renderSimulationDefaults();
  }

  function renderHome() {
    const c = calculations;
    const s = c.snapshot;
    els.currentBalance.textContent = money(s.currentBalance);
    els.balanceCaption.textContent = `من أصل ${money(state.loan.amount)}`;
    els.progressBar.style.width = `${s.progress.toFixed(2)}%`;
    els.progressRing.style.setProperty(`--pct`, s.progress.toFixed(2));
    els.progressPct.textContent = `${formatNumber(s.progress, 1)}%`;
    els.progressInline.textContent = `${formatNumber(s.progress, 1)}%`;
    els.nextPayment.textContent = s.nextPaymentDate ? formatShortDate(s.nextPaymentDate) : `مكتمل`;
    els.currentPayoff.textContent = formatShortDate(c.current.payoffDate);
    els.remainingInterest.textContent = money(s.remainingInterest);
    els.extraPaidTotal.textContent = money(c.totalExtra);
    els.monthsSaved.textContent = c.monthsSaved > 0 ? `${formatNumber(c.monthsSaved)} أشهر` : `0 شهر`;
    els.baselinePayoff.textContent = formatShortDate(c.baseline.payoffDate);
    els.impactCurrentPayoff.textContent = formatShortDate(c.current.payoffDate);
    els.interestSaved.textContent = money(c.interestSaved);
    renderRecentPayment();
  }

  function renderRecentPayment() {
    const payment = [...state.extraPayments].sort((a, b) => compareDates(b.date, a.date))[0];
    if (!payment) {
      els.recentPaymentCard.innerHTML = `<div class="empty-card">لم تسجل أي دفعة إضافية بعد.</div>`;
      return;
    }
    els.recentPaymentCard.innerHTML = `
      <article class="payment-mini">
        <div class="payment-mini__icon"><svg><use href="#i-wallet"></use></svg></div>
        <div class="payment-mini__copy"><strong>دفعة إضافية</strong><span>${escapeHTML(formatShortDate(payment.date))}</span></div>
        <div class="payment-mini__amount">${escapeHTML(money(payment.amount))}</div>
      </article>`;
  }

  function renderPayments() {
    const sorted = [...state.extraPayments].sort((a, b) => compareDates(b.date, a.date));
    els.paymentsTotal.textContent = money(calculations.totalExtra);
    els.paymentCount.textContent = `${formatNumber(sorted.length)} دفعة`;

    if (!sorted.length) {
      els.paymentsList.innerHTML = `<div class="empty-card">لا توجد دفعات إضافية حالياً.<br>أضف دفعة لتسريع سداد القرض.</div>`;
      return;
    }

    els.paymentsList.innerHTML = sorted.map((payment) => {
      const impact = calculatePaymentImpact(payment.id);
      return `
        <article class="payment-card">
          <div class="payment-card__top">
            <div class="payment-card__icon"><svg><use href="#i-coins"></use></svg></div>
            <div class="payment-card__meta"><strong>${escapeHTML(payment.note || `دفعة إضافية`)}</strong><span>${escapeHTML(formatShortDate(payment.date))}</span></div>
            <div class="payment-card__amount">${escapeHTML(money(payment.amount))}</div>
          </div>
          <div class="payment-card__impact">
            <div><span>وفرت مدة تقريبية</span><strong>${impact.monthsSaved > 0 ? `${formatNumber(impact.monthsSaved)} أشهر` : `—`}</strong></div>
            <div><span>وفرت فائدة تقريبية</span><strong>${escapeHTML(money(Math.max(0, impact.interestSaved)))}</strong></div>
          </div>
          <div class="payment-card__actions">
            <button class="action-button" type="button" data-payment-action="edit" data-id="${escapeHTML(payment.id)}"><svg><use href="#i-edit"></use></svg><span>تعديل</span></button>
            <button class="action-button danger" type="button" data-payment-action="delete" data-id="${escapeHTML(payment.id)}"><svg><use href="#i-trash"></use></svg><span>حذف</span></button>
          </div>
        </article>`;
    }).join(``);
  }

  function calculatePaymentImpact(paymentId) {
    const without = state.extraPayments.filter((item) => item.id !== paymentId);
    const before = generateSchedule(state.loan, without);
    const after = calculations.current;
    return {
      monthsSaved: monthDifference(after.payoffDate, before.payoffDate),
      interestSaved: round2(before.totalInterest - after.totalInterest)
    };
  }

  function renderScheduleFilters() {
    const years = [...new Set(calculations.current.rows.map((row) => row.date.slice(0, 4)))];
    const selected = els.scheduleYear.value || `all`;
    els.scheduleYear.innerHTML = [`<option value="all">كل السنوات</option>`, ...years.map((year) => `<option value="${year}">${year}</option>`)].join(``);
    els.scheduleYear.value = years.includes(selected) ? selected : `all`;
  }

  function renderSchedule() {
    const year = els.scheduleYear.value || `all`;
    const query = String(els.scheduleSearch.value || ``).trim();
    const rows = calculations.current.rows.filter((row) => {
      const yearOk = year === `all` || row.date.startsWith(year);
      const searchOk = !query || row.date.includes(query) || formatShortDate(row.date).includes(query);
      return yearOk && searchOk;
    });

    els.scheduleRows.innerHTML = rows.length ? rows.map((row) => `
      <article class="schedule-row ${row.extraPayment > 0 ? `is-extra` : ``}">
        <span class="date-cell"><b>${escapeHTML(formatShortDate(row.date))}</b><small>قسط ${formatNumber(row.number)}</small></span>
        <span>${escapeHTML(money(row.installment))}</span>
        <span>${escapeHTML(money(row.principal))}</span>
        <span>${escapeHTML(money(row.interest))}</span>
        <span>${escapeHTML(money(row.closingBalance))}</span>
        ${row.extraPayment > 0 ? `<em>تتضمن دفعة إضافية ${escapeHTML(money(row.extraPayment))}</em>` : ``}
      </article>`).join(``) : `<div class="empty-card">لا توجد نتائج مطابقة.</div>`;

    els.scheduleInterestTotal.textContent = money(calculations.current.totalInterest);
    els.schedulePayoffDate.textContent = formatShortDate(calculations.current.payoffDate);
  }

  function renderSimulationDefaults() {
    if (!els.simulationDate.value) els.simulationDate.value = todayKey();
  }

  function handleSimulation(event) {
    event.preventDefault();
    const amount = round2(num(els.simulationAmount.value));
    const date = els.simulationDate.value;
    if (amount <= 0) return showToast(`أدخل مبلغ دفعة أكبر من صفر.`);
    if (!validDate(date)) return showToast(`اختر تاريخ دفعة صحيح.`);
    if (compareDates(date, state.loan.agreementDate) < 0) return showToast(`لا يمكن تسجيل دفعة قبل تاريخ الاتفاق.`);

    const simulatedPayment = { id: `simulation`, amount, date, note: `دفعة افتراضية`, source: `simulation`, createdAt: new Date().toISOString() };
    const simulated = generateSchedule(state.loan, [...state.extraPayments, simulatedPayment]);
    const current = calculations.current;
    const monthsSaved = monthDifference(simulated.payoffDate, current.payoffDate);
    const interestSaved = round2(current.totalInterest - simulated.totalInterest);

    pendingSimulation = { payment: simulatedPayment, simulated, monthsSaved, interestSaved };
    els.simCurrentPayoff.textContent = formatShortDate(current.payoffDate);
    els.simNewPayoff.textContent = formatShortDate(simulated.payoffDate);
    els.simMonthsSaved.textContent = monthsSaved > 0 ? `${formatNumber(monthsSaved)} أشهر` : `0 شهر`;
    els.simInterestSaved.textContent = money(Math.max(0, interestSaved));
    els.simulationResults.hidden = false;
    els.simulationResults.scrollIntoView({ behavior: `smooth`, block: `nearest` });
  }

  function commitSimulationAsPayment() {
    if (!pendingSimulation) return;
    const payment = { ...pendingSimulation.payment, id: createId(), source: `manual`, note: `دفعة سجلت بعد المحاكاة` };
    state.extraPayments.push(payment);
    saveState();
    clearSimulation();
    recalculate();
    navigate(`payments`);
    showToast(`تم تسجيل الدفعة كحركة فعلية.`);
  }

  function clearSimulation() {
    pendingSimulation = null;
    els.simulationAmount.value = ``;
    els.simulationResults.hidden = true;
  }

  function openPaymentSheet(payment = null) {
    const editing = Boolean(payment);
    els.paymentId.value = editing ? payment.id : ``;
    els.paymentAmount.value = editing ? payment.amount : ``;
    els.paymentDate.value = editing ? payment.date : todayKey();
    els.paymentNote.value = editing ? payment.note : ``;
    els.paymentSubmitText.textContent = editing ? `حفظ التعديل` : `حفظ الدفعة`;
    renderPaymentPreview();
    openSheet(els.paymentSheet);
    window.setTimeout(() => els.paymentAmount.focus(), 220);
  }

  function closePaymentSheet() {
    closeSheet(els.paymentSheet);
    els.paymentForm.reset();
    els.paymentId.value = ``;
  }

  function renderPaymentPreview() {
    const amount = round2(num(els.paymentAmount.value));
    const date = els.paymentDate.value;
    if (amount <= 0 || !validDate(date)) {
      els.paymentPreview.textContent = `أدخل المبلغ والتاريخ وسأعرض أثر الدفعة قبل الحفظ.`;
      return;
    }
    const editingId = els.paymentId.value;
    const baseExtras = state.extraPayments.filter((item) => item.id !== editingId);
    const before = generateSchedule(state.loan, baseExtras);
    const after = generateSchedule(state.loan, [...baseExtras, { id: `preview`, amount, date, note: ``, createdAt: new Date().toISOString() }]);
    const months = monthDifference(after.payoffDate, before.payoffDate);
    const interest = round2(before.totalInterest - after.totalInterest);
    els.paymentPreview.innerHTML = `متوقع أن تقرّب النهاية <strong>${formatNumber(Math.max(0, months))} أشهر</strong> وتوفر تقريباً <strong>${money(Math.max(0, interest))}</strong> من الفائدة.`;
  }

  function handlePaymentSubmit(event) {
    event.preventDefault();
    const id = els.paymentId.value;
    const amount = round2(num(els.paymentAmount.value));
    const date = els.paymentDate.value;
    const note = String(els.paymentNote.value || ``).trim();

    if (amount <= 0) return showToast(`قيمة الدفعة يجب أن تكون أكبر من صفر.`);
    if (!validDate(date)) return showToast(`اختر تاريخ دفعة صحيح.`);
    if (compareDates(date, state.loan.agreementDate) < 0) return showToast(`لا يمكن تسجيل دفعة قبل تاريخ الاتفاق.`);

    const payment = { id: id || createId(), amount, date, note, source: `manual`, createdAt: id ? (state.extraPayments.find((item) => item.id === id)?.createdAt || new Date().toISOString()) : new Date().toISOString() };
    const index = state.extraPayments.findIndex((item) => item.id === payment.id);
    if (index >= 0) state.extraPayments[index] = payment;
    else state.extraPayments.push(payment);

    saveState();
    closePaymentSheet();
    recalculate();
    showToast(index >= 0 ? `تم تحديث الدفعة.` : `تم حفظ الدفعة وتحديث القرض.`);
  }

  function handlePaymentAction(event) {
    const button = event.target.closest(`[data-payment-action]`);
    if (!button) return;
    const payment = state.extraPayments.find((item) => item.id === button.dataset.id);
    if (!payment) return;

    if (button.dataset.paymentAction === `edit`) {
      openPaymentSheet(payment);
      return;
    }

    if (button.dataset.paymentAction === `delete`) {
      askConfirm(`حذف الدفعة؟`, `سيتم حذف ${money(payment.amount)} بتاريخ ${formatShortDate(payment.date)} وإعادة احتساب القرض.`, async (accepted) => {
        if (!accepted) return;
        state.extraPayments = state.extraPayments.filter((item) => item.id !== payment.id);
        saveState();
        recalculate();
        showToast(`تم حذف الدفعة.`);
      });
    }
  }

  function navigate(view, persist = true) {
    const safeView = $(`[data-view="${view}"]`) ? view : `home`;
    $$(`[data-view]`).forEach((section) => section.classList.toggle(`is-active`, section.dataset.view === safeView));
    $$(`[data-nav]`).forEach((button) => button.classList.toggle(`is-active`, button.dataset.nav === safeView));
    if (persist) {
      state.lastView = safeView;
      saveState();
    }
    window.scrollTo({ top: 0, behavior: `smooth` });
  }

  function openSettings() {
    hydrateSettings();
    openSheet(els.settingsSheet);
  }

  function closeSettings() {
    closeSheet(els.settingsSheet);
  }

  function hydrateSettings() {
    els.settingAmount.value = state.loan.amount;
    els.settingPayment.value = state.loan.monthlyPayment;
    els.settingRate.value = state.loan.annualRate;
    els.settingAgreementDate.value = state.loan.agreementDate;
    els.settingFirstDate.value = state.loan.firstInstallmentDate;
    els.settingTerm.value = state.loan.bankInstallmentCount;
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const nextLoan = validateLoan({
      ...state.loan,
      amount: num(els.settingAmount.value),
      monthlyPayment: num(els.settingPayment.value),
      annualRate: num(els.settingRate.value),
      agreementDate: els.settingAgreementDate.value,
      firstInstallmentDate: els.settingFirstDate.value,
      bankInstallmentCount: num(els.settingTerm.value)
    });

    if (compareDates(nextLoan.firstInstallmentDate, nextLoan.agreementDate) <= 0) return showToast(`تاريخ أول قسط يجب أن يكون بعد تاريخ الاتفاق.`);
    state.loan = nextLoan;
    saveState();
    closeSettings();
    recalculate();
    showToast(`تم حفظ إعدادات القرض.`);
  }

  function requestReset() {
    askConfirm(`استعادة بيانات البنك؟`, `سيتم حذف أي تعديلات ودفعات أضفتها وإرجاع بيانات كشف البنك كما هي.`, (accepted) => {
      if (!accepted) return;
      state = clone(BANK_DEFAULTS);
      saveState();
      hydrateSettings();
      closeSettings();
      recalculate();
      navigate(`home`);
      showToast(`تمت استعادة بيانات البنك الأصلية.`);
    });
  }

  function exportBackup() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2);
    downloadFile(`loan-backup-${todayKey()}.json`, payload, `application/json;charset=utf-8`);
    showToast(`تم إنشاء النسخة الاحتياطية.`);
  }

  function exportScheduleCSV() {
    const headers = [`رقم القسط`, `التاريخ`, `رصيد البداية`, `القسط`, `أصل الدين`, `الفائدة`, `دفعة إضافية`, `الرصيد`];
    const rows = calculations.current.rows.map((row) => [
      row.number,
      row.date,
      fixed(row.openingBalance),
      fixed(row.installment),
      fixed(row.principal),
      fixed(row.interest),
      fixed(row.extraPayment),
      fixed(row.closingBalance)
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(`,`)).join(`\n`);
    downloadFile(`loan-schedule-${todayKey()}.csv`, `\uFEFF${csv}`, `text/csv;charset=utf-8`);
    showToast(`تم تصدير جدول السداد.`);
  }

  function setDefaultDates() {
    els.paymentDate.min = state.loan.agreementDate;
    els.simulationDate.min = state.loan.agreementDate;
    if (!els.simulationDate.value) els.simulationDate.value = todayKey();
  }

  function openSheet(element) {
    element.classList.add(`is-open`);
    element.setAttribute(`aria-hidden`, `false`);
    document.body.style.overflow = `hidden`;
  }

  function closeSheet(element) {
    element.classList.remove(`is-open`);
    element.setAttribute(`aria-hidden`, `true`);
    document.body.style.overflow = ``;
  }

  function askConfirm(title, message, callback) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    confirmResolver = callback;
    els.confirmDialog.classList.add(`is-open`);
    els.confirmDialog.setAttribute(`aria-hidden`, `false`);
  }

  function resolveConfirm(value) {
    els.confirmDialog.classList.remove(`is-open`);
    els.confirmDialog.setAttribute(`aria-hidden`, `true`);
    const resolver = confirmResolver;
    confirmResolver = null;
    if (typeof resolver === `function`) resolver(value);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add(`is-visible`);
    toastTimer = window.setTimeout(() => els.toast.classList.remove(`is-visible`), 2600);
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, `0`)}-${String(now.getDate()).padStart(2, `0`)}`;
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  }

  function addMonths(isoDate, months) {
    const date = new Date(`${isoDate}T12:00:00`);
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
    target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, `0`)}-${String(target.getDate()).padStart(2, `0`)}`;
  }

  function daysBetween(fromIso, toIso) {
    const from = new Date(`${fromIso}T12:00:00`);
    const to = new Date(`${toIso}T12:00:00`);
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
  }

  function compareDates(a, b) {
    return String(a).localeCompare(String(b));
  }

  function monthDifference(earlierPayoff, laterPayoff) {
    if (!validDate(earlierPayoff) || !validDate(laterPayoff)) return 0;
    const a = new Date(`${earlierPayoff}T12:00:00`);
    const b = new Date(`${laterPayoff}T12:00:00`);
    const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    return Math.max(0, months + (b.getDate() >= a.getDate() ? 0 : -1));
  }

  function formatShortDate(isoDate) {
    if (!validDate(isoDate)) return `—`;
    const [year, month, day] = isoDate.split(`-`);
    return `${day}/${month}/${year}`;
  }

  function money(value) {
    return `${new Intl.NumberFormat(`en-JO`, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, num(value)))} د.أ`;
  }

  function formatNumber(value, digits = 0) {
    return new Intl.NumberFormat(`ar-JO`, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(num(value));
  }

  function num(value) {
    const parsed = Number(String(value ?? ``).replace(/,/g, ``));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function fixed(value) {
    return round2(value).toFixed(2);
  }

  function csvCell(value) {
    const text = String(value ?? ``).replace(/"/g, `""`);
    return `"${text}"`;
  }

  function escapeHTML(value) {
    return String(value ?? ``)
      .replace(/&/g, `&amp;`)
      .replace(/</g, `&lt;`)
      .replace(/>/g, `&gt;`)
      .replace(/"/g, `&quot;`)
      .replace(/'/g, `&#039;`);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement(`a`);
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
})();
