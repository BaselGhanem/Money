(() => {
  `use strict`;

  const STORE = `salary_manager_v2`;
  const CATEGORIES = [`دخل`, `قرض`, `عائلة`, `فواتير`, `شخصي`, `منزل`, `مواصلات`, `اشتراكات`, `بطاقات`, `دين`, `دورات`, `بطاقة`];
  const $ = id => document.getElementById(id);
  const money = (value, currency = `د.أ`) => `${Number(value || 0).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  function state() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || `null`);
    } catch {
      return null;
    }
  }

  function activeMonthData(st) {
    if (!st?.months) return { items: [], transfers: [] };
    return st.months[st.activeMonth] || { items: [], transfers: [] };
  }

  function accountBalances(st) {
    const month = activeMonthData(st);
    const balances = {};
    Object.entries(st?.accounts || {}).forEach(([name, account]) => {
      balances[name] = Number(account?.opening || 0);
    });
    month.items.forEach(item => {
      const amount = Number(item.amount || 0);
      if (!(item.account in balances)) balances[item.account] = 0;
      balances[item.account] += item.type === `income` ? amount : -amount;
    });
    month.transfers.forEach(item => {
      const amount = Number(item.amount || 0);
      if (!(item.from in balances)) balances[item.from] = 0;
      if (!(item.to in balances)) balances[item.to] = 0;
      balances[item.from] -= amount;
      balances[item.to] += amount;
    });
    return balances;
  }

  function populateCategories() {
    const transactionCategory = $(`transactionCategory`);
    const optionHtml = CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join(``);

    if (transactionCategory) {
      const previous = transactionCategory.value;
      transactionCategory.innerHTML = optionHtml;
      if (CATEGORIES.includes(previous)) transactionCategory.value = previous;
    }

    [`txCategory`, `reportCategory`].forEach(id => {
      const select = $(id);
      if (!select) return;
      const previous = select.value || `all`;
      select.innerHTML = `<option value="all">كل التصنيفات</option>${optionHtml}`;
      select.value = CATEGORIES.includes(previous) ? previous : `all`;
    });
  }

  function renderFinancialCockpit() {
    const st = state();
    if (!st) return;
    const month = activeMonthData(st);
    const currency = st.settings?.currency || `د.أ`;
    const income = month.items.filter(item => item.type === `income`).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expenses = month.items.filter(item => item.type === `expense`);
    const expense = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const rate = income ? Math.round((expense / income) * 100) : 0;

    const balances = accountBalances(st);
    const liquidity = Object.entries(st.accounts || {})
      .filter(([, account]) => account?.active !== false)
      .reduce((sum, [name]) => sum + Number(balances[name] || 0), 0);

    if ($(`liquidityTotal`)) $(`liquidityTotal`).textContent = money(liquidity, currency);
    if ($(`spendProgress`)) $(`spendProgress`).style.width = `${Math.min(100, Math.max(0, rate))}%`;

    const recurring = expenses
      .filter(item => item.recurring)
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    const recurringTotal = recurring.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    if ($(`commitmentsTotal`)) $(`commitmentsTotal`).textContent = money(recurringTotal, currency);
    if ($(`upcomingList`)) {
      $(`upcomingList`).innerHTML = recurring.length
        ? recurring.slice(0, 5).map(item => `
            <div class="commitmentRow">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.category || `بدون تصنيف`)} · ${item.date ? escapeHtml(item.date) : `متكرر شهريا`}</span>
              </div>
              <strong class="moneyValue">${money(item.amount, currency)}</strong>
            </div>
          `).join(``)
        : `<div class="empty compactEmpty">لا توجد التزامات متكررة.</div>`;
    }

    const categoryMap = expenses.reduce((result, item) => {
      const category = item.category || `بدون تصنيف`;
      result[category] = (result[category] || 0) + Number(item.amount || 0);
      return result;
    }, {});
    const categories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
    const max = categories[0]?.[1] || 1;

    if ($(`categoryCount`)) $(`categoryCount`).textContent = `${categories.length} تصنيف`;
    if ($(`categoryBreakdown`)) {
      $(`categoryBreakdown`).innerHTML = categories.length
        ? categories.slice(0, 6).map(([category, value]) => `
            <div class="categoryRow">
              <div class="categoryMeta">
                <strong>${escapeHtml(category)}</strong>
                <span class="moneyValue">${money(value, currency)}</span>
              </div>
              <div class="categoryTrack"><i style="width:${Math.max(7, Math.round((value / max) * 100))}%"></i></div>
            </div>
          `).join(``)
        : `<div class="empty compactEmpty">لا توجد مصاريف بعد.</div>`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? ``).replace(/[&<>"']/g, character => ({
      [`&`]: `&amp;`,
      [`<`]: `&lt;`,
      [`>`]: `&gt;`,
      [`"`]: `&quot;`,
      [`'`]: `&#39;`
    })[character]);
  }

  function applyTransactionCategoryFilter() {
    const filter = $(`txCategory`)?.value || `all`;
    document.querySelectorAll(`#txList .tx`).forEach(row => {
      const badges = [...row.querySelectorAll(`.badge`)].map(node => node.textContent.trim());
      row.style.display = filter === `all` || badges.includes(filter) ? `` : `none`;
    });
  }

  function applyReportCategoryFilter() {
    const filter = $(`reportCategory`)?.value || `all`;
    document.querySelectorAll(`#reportBody tr`).forEach(row => {
      const cells = row.querySelectorAll(`td`);
      if (cells.length < 6) return;
      row.style.display = filter === `all` || cells[5].textContent.trim() === filter ? `` : `none`;
    });
  }

  function syncNewTransactionCategory() {
    setTimeout(() => {
      const type = $(`transactionType`)?.value;
      const category = $(`transactionCategory`);
      if (!category || $(`transactionId`)?.value) return;
      category.value = type === `income` ? `دخل` : `شخصي`;
    }, 0);
  }

  function bindEnhancements() {
    $(`mobileAddBtn`)?.addEventListener(`click`, () => $(`addTransactionBtn`)?.click());
    $(`addTransactionBtn`)?.addEventListener(`click`, syncNewTransactionCategory);

    $(`transactionType`)?.addEventListener(`change`, () => {
      const category = $(`transactionCategory`);
      if (!category) return;
      if ($(`transactionType`).value === `income` && ![`دخل`, `دورات`].includes(category.value)) category.value = `دخل`;
      if ($(`transactionType`).value === `expense` && [`دخل`, `دورات`].includes(category.value)) category.value = `شخصي`;
    });

    $(`txCategory`)?.addEventListener(`change`, applyTransactionCategoryFilter);
    $(`reportCategory`)?.addEventListener(`change`, applyReportCategoryFilter);

    const txList = $(`txList`);
    if (txList) new MutationObserver(applyTransactionCategoryFilter).observe(txList, { childList: true });

    const reportBody = $(`reportBody`);
    if (reportBody) new MutationObserver(applyReportCategoryFilter).observe(reportBody, { childList: true });

    const recentList = $(`recentList`);
    if (recentList) new MutationObserver(renderFinancialCockpit).observe(recentList, { childList: true });
  }

  function init() {
    populateCategories();
    bindEnhancements();
    renderFinancialCockpit();
    applyTransactionCategoryFilter();
    applyReportCategoryFilter();
  }

  window.addEventListener(`load`, () => setTimeout(init, 950));
})();