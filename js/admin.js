/*
 * Сторінка власника бюджету (admin.html):
 *   1. Заявки: перегляд із фільтром статусу (GET /requests?status=…);
 *   2. Рахунки — «пропозиції»: перегляд і форма редагування;
 *   3. Операції: журнал з пошуком, фільтрами й сортуванням;
 *   4. Категорії: перегляд.
 *
 * Етап 3: читання даних (GET) і готовий інтерфейс.
 * Збереження змін (POST, PATCH, DELETE) і зміна статусу заявок — етап 4.
 * Доступ до даних — лише через FinanceRepository; тут тільки інтерфейс.
 */
import { API_URL } from "./config.js";
import { HttpClient } from "./api.js";
import { FinanceRepository } from "./repository.js";
import { ACCOUNT_TYPES, LIMITS, TRANSACTION_TYPES } from "./validation.js";
import { formatAmountInput, formatDate, formatDateTime, formatMoney, toCents, todayISO } from "./money.js";
import {
  clearGlobalError, clearMessage, escapeHtml, fillSelect, plural,
  showGlobalError, showMessage, stateBlock, stateRow, statusBadge,
} from "./ui.js";

const repository = new FinanceRepository(new HttpClient(API_URL));

// Повідомлення для дій, які з'являться на наступному етапі
const NEXT_STAGE = "буде реалізовано на етапі 4.";

// =====================================================================
// Стан сторінки
// =====================================================================

const state = {
  loaded: false,
  accounts: [],
  categories: [],
  transactions: [],
  allRequests: [],     // усі заявки — для лічильників використання категорій
  requests: [],        // заявки, показані в таблиці (з фільтром статусу)
  editingAccountId: null,
};

const $ = (selector) => document.querySelector(selector);
const el = {
  globalError: $("#global-error"),

  requestsStatus: $("#requests-status"),
  requestsRefresh: $("#requests-refresh"),
  requestsInfo: $("#requests-info"),
  requestsList: $("#requests-list"),
  requestsMessage: $("#requests-message"),

  accountsList: $("#accounts-list"),
  accountForm: $("#account-form"),
  accountFormTitle: $("#account-form-title"),
  accountName: $("#account-name"),
  accountType: $("#account-type"),
  accountBalance: $("#account-balance"),
  accountOpen: $("#account-open"),
  accountBalanceHint: $("#account-balance-hint"),
  accountSubmit: $("#account-submit"),
  accountCancel: $("#account-cancel"),
  accountMessage: $("#account-message"),

  transactionForm: $("#transaction-form"),
  transactionDate: $("#transaction-date"),
  transactionAccount: $("#transaction-account"),
  transactionCategory: $("#transaction-category"),
  transactionMessage: $("#transaction-message"),
  transactionsList: $("#transactions-list"),
  transactionsInfo: $("#transactions-info"),

  filterSearch: $("#filter-search"),
  filterType: $("#filter-type"),
  filterAccount: $("#filter-account"),
  filterCategory: $("#filter-category"),
  filterDateFrom: $("#filter-date-from"),
  filterDateTo: $("#filter-date-to"),
  sortOrder: $("#sort-order"),
  filterReset: $("#filter-reset"),

  categoriesExpense: $("#categories-expense"),
  categoriesIncome: $("#categories-income"),
  categoryForm: $("#category-form"),
  categoryMessage: $("#category-message"),
};

const OPERATIONS = ["операція", "операції", "операцій"];
const REQUESTS = ["заявка", "заявки", "заявок"];

const findById = (list, id) => list.find((item) => item.id === id);
const nameOf = (list, id) => (findById(list, id) || {}).name || "—";

// =====================================================================
// Завантаження даних (GET)
// =====================================================================

/** Рахунки, категорії, операції та всі заявки */
async function loadAll() {
  try {
    const [accounts, categories, transactions, allRequests] = await Promise.all([
      repository.getAccounts(),
      repository.getCategories(),
      repository.getTransactions(),
      repository.getRequests(),
    ]);
    Object.assign(state, { accounts, categories, transactions, allRequests, loaded: true });
    clearGlobalError(el.globalError);
  } catch (error) {
    showGlobalError(el.globalError, error.message);
  }
  renderAccounts();
  renderCategories();
  renderSelectOptions();
  renderTransactions();
}

/** Заявки для таблиці: GET /requests з фільтром статусу на сервері */
async function loadRequests() {
  el.requestsList.innerHTML = stateRow("loading", "Завантаження заявок…", 9);
  el.requestsInfo.textContent = "";
  try {
    state.requests = await repository.getRequests({ status: el.requestsStatus.value });
    renderRequests();
  } catch (error) {
    state.requests = [];
    el.requestsList.innerHTML = stateRow("error", `Не вдалося завантажити заявки. ${error.message}`, 9);
    showGlobalError(el.globalError, error.message);
  }
}

/** Спершу довідники, потім заявки: таблиця заявок показує назви рахунків і категорій */
async function reloadEverything() {
  await loadAll();
  await loadRequests();
}

const emptyText = (text) => (state.loaded ? text : "Дані не завантажено: сервер недоступний.");

// =====================================================================
// Рендер
// =====================================================================

function renderRequests() {
  const filterLabel = el.requestsStatus.selectedOptions[0].textContent.toLowerCase();
  const count = state.requests.length;
  el.requestsInfo.textContent = `Показано ${count} ${plural(count, REQUESTS)} (${filterLabel}).`;

  if (count === 0) {
    el.requestsList.innerHTML = stateRow("empty", "Заявок із таким статусом немає.", 9);
    return;
  }

  el.requestsList.innerHTML = state.requests
    .map((r) => {
      const account = findById(state.accounts, r.accountId);
      return `
        <tr>
          <td class="nowrap">${formatDateTime(r.createdAt)}</td>
          <td>${escapeHtml(r.requesterName)}</td>
          <td>${account ? `${escapeHtml(account.name)}<br><span class="muted">${formatMoney(account.balance)}</span>` : "—"}</td>
          <td>${escapeHtml(nameOf(state.categories, r.categoryId))}</td>
          <td>${escapeHtml(r.purpose)}</td>
          <td class="amount">${formatMoney(r.amount)}</td>
          <td>${statusBadge(r.status)}</td>
          <td class="muted">${escapeHtml(r.adminComment || "—")}</td>
          <td class="actions"></td>
        </tr>`;
    })
    .join("");
}

function renderAccounts() {
  if (state.accounts.length === 0) {
    el.accountsList.innerHTML = stateBlock(state.loaded ? "empty" : "error",
      emptyText("Рахунків ще немає."));
    return;
  }
  el.accountsList.innerHTML = state.accounts
    .map((a) => `
      <article class="account-card${a.id === state.editingAccountId ? " editing" : ""}">
        <span class="type">${escapeHtml(ACCOUNT_TYPES[a.type] || a.type)}</span>
        <span class="name">${escapeHtml(a.name)}</span>
        <span class="balance${toCents(a.balance) === 0 ? " zero" : ""}">${formatMoney(a.balance)}</span>
        <span>${a.openForRequests
          ? '<span class="badge open">Відкритий для заявок</span>'
          : '<span class="badge closed">Закритий для заявок</span>'}</span>
        <div class="card-actions">
          <button type="button" class="btn-secondary btn-small" data-action="edit-account" data-id="${escapeHtml(a.id)}">Редагувати</button>
          <button type="button" class="btn-danger btn-small" data-action="delete-account" data-id="${escapeHtml(a.id)}">Видалити</button>
        </div>
      </article>`)
    .join("");
}

function renderCategories() {
  const renderList = (type) => {
    const items = state.categories
      .filter((c) => c.type === type)
      .sort((a, b) => a.name.localeCompare(b.name, "uk"));
    if (items.length === 0) return `<li>${stateBlock(state.loaded ? "empty" : "error", emptyText("Немає категорій"))}</li>`;

    return items
      .map((c) => {
        const ops = state.transactions.filter((t) => t.categoryId === c.id).length;
        const reqs = state.allRequests.filter((r) => r.categoryId === c.id).length;
        const usage = reqs > 0 ? `${ops} ${plural(ops, OPERATIONS)}, ${reqs} ${plural(reqs, REQUESTS)}` : `${ops} ${plural(ops, OPERATIONS)}`;
        return `<li><span>${escapeHtml(c.name)} <span class="count">· ${usage}</span></span></li>`;
      })
      .join("");
  };
  el.categoriesExpense.innerHTML = renderList("expense");
  el.categoriesIncome.innerHTML = renderList("income");
}

function categoryOptions(categories) {
  return categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "uk"))
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
}

function renderSelectOptions() {
  fillSelect(
    el.transactionAccount,
    '<option value="">— оберіть рахунок —</option>' +
      state.accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${formatMoney(a.balance)}</option>`).join("")
  );
  renderTransactionCategoryOptions();
  fillSelect(
    el.filterAccount,
    '<option value="">Усі</option>' +
      state.accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("")
  );
  fillSelect(
    el.filterCategory,
    '<option value="">Усі</option>' +
      `<optgroup label="Витрати">${categoryOptions(state.categories.filter((c) => c.type === "expense"))}</optgroup>` +
      `<optgroup label="Доходи">${categoryOptions(state.categories.filter((c) => c.type === "income"))}</optgroup>`
  );
}

function getSelectedTransactionType() {
  const checked = el.transactionForm.querySelector('input[name="transaction-type"]:checked');
  return checked ? checked.value : "";
}

/** У формі операції — лише категорії обраного типу */
function renderTransactionCategoryOptions() {
  const type = getSelectedTransactionType();
  fillSelect(
    el.transactionCategory,
    '<option value="">— оберіть категорію —</option>' + categoryOptions(state.categories.filter((c) => c.type === type))
  );
}

/** Пошук, фільтрування та сортування журналу (на вже завантажених даних) */
function getVisibleTransactions() {
  const search = el.filterSearch.value.trim().toLowerCase();
  const type = el.filterType.value;
  const accountId = el.filterAccount.value;
  const categoryId = el.filterCategory.value;
  const dateFrom = el.filterDateFrom.value;
  const dateTo = el.filterDateTo.value;

  const result = state.transactions.filter((t) => {
    if (type && t.type !== type) return false;
    if (accountId && t.accountId !== accountId) return false;
    if (categoryId && t.categoryId !== categoryId) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    if (search) {
      const text = `${t.comment || ""} ${nameOf(state.categories, t.categoryId)}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const [field, direction] = el.sortOrder.value.split("-");
  const sign = direction === "asc" ? 1 : -1;
  result.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    const byAmount = toCents(a.amount) - toCents(b.amount);
    return sign * (field === "amount" ? byAmount || byDate : byDate || byAmount);
  });
  return result;
}

function renderTransactions() {
  const visible = getVisibleTransactions();
  const total = state.transactions.length;

  let info = `Показано ${visible.length} з ${total} ${plural(total, OPERATIONS)}.`;
  if (el.filterDateFrom.value && el.filterDateTo.value && el.filterDateFrom.value > el.filterDateTo.value) {
    info += " Увага: дата «від» пізніша за дату «до».";
  }
  el.transactionsInfo.textContent = info;

  if (visible.length === 0) {
    const text = total === 0 ? emptyText("Операцій ще немає.") : "Немає операцій, що відповідають умовам пошуку.";
    el.transactionsList.innerHTML = stateRow(state.loaded ? "empty" : "error", text, 7);
    return;
  }

  el.transactionsList.innerHTML = visible
    .map((t) => {
      const sign = t.type === "income" ? "+" : "−";
      const mark = t.requestId ? '<span class="badge link" title="Створено під час схвалення заявки">за заявкою</span>' : "";
      return `
        <tr>
          <td class="nowrap">${formatDate(t.date)}</td>
          <td><span class="badge ${t.type}">${TRANSACTION_TYPES[t.type]}</span></td>
          <td>${escapeHtml(nameOf(state.categories, t.categoryId))}</td>
          <td>${escapeHtml(nameOf(state.accounts, t.accountId))}</td>
          <td class="muted">${escapeHtml(t.comment || "")}</td>
          <td class="amount ${t.type}">${sign}${formatMoney(t.amount)}</td>
          <td class="actions">${mark}</td>
        </tr>`;
    })
    .join("");
}

function resetAccountForm() {
  state.editingAccountId = null;
  el.accountForm.reset();
  el.accountBalance.disabled = false;
  el.accountBalanceHint.hidden = true;
  el.accountFormTitle.textContent = "Новий рахунок";
  el.accountSubmit.textContent = "Додати рахунок";
  el.accountCancel.hidden = true;
}

// =====================================================================
// Обробники подій
// =====================================================================

el.requestsStatus.addEventListener("change", () => {
  clearMessage(el.requestsMessage);
  loadRequests();
});

el.requestsRefresh.addEventListener("click", () => {
  clearMessage(el.requestsMessage);
  reloadEverything();
});

// Форма редагування рахунку: заповнення з обраної картки
el.accountsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const account = findById(state.accounts, button.dataset.id);
  if (!account) return;

  if (button.dataset.action === "edit-account") {
    state.editingAccountId = account.id;
    el.accountName.value = account.name;
    el.accountType.value = account.type;
    el.accountBalance.value = formatAmountInput(account.balance);
    el.accountBalance.disabled = true;
    el.accountOpen.checked = Boolean(account.openForRequests);
    el.accountBalanceHint.hidden = false;
    el.accountFormTitle.textContent = `Редагування рахунку «${account.name}»`;
    el.accountSubmit.textContent = "Зберегти зміни";
    el.accountCancel.hidden = false;
    clearMessage(el.accountMessage);
    renderAccounts();
    el.accountName.focus();
  }

  if (button.dataset.action === "delete-account") {
    // Місце підтвердження видалення підготовлено; сам DELETE — етап 4
    if (!confirm(`Видалити рахунок «${account.name}»?`)) return;
    showMessage(el.accountMessage, `Видалення рахунку (DELETE /accounts/:id) ${NEXT_STAGE}`, "info");
  }
});

el.accountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage(el.accountMessage, `Збереження рахунку (POST / PATCH /accounts) ${NEXT_STAGE}`, "info");
});

el.accountCancel.addEventListener("click", () => {
  resetAccountForm();
  clearMessage(el.accountMessage);
  renderAccounts();
});

el.transactionForm.querySelectorAll('input[name="transaction-type"]').forEach((radio) => {
  radio.addEventListener("change", renderTransactionCategoryOptions);
});

el.transactionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage(el.transactionMessage, `Проведення операції (POST /transactions) ${NEXT_STAGE}`, "info");
});

el.categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage(el.categoryMessage, `Збереження категорії (POST / PATCH /categories) ${NEXT_STAGE}`, "info");
});

[el.filterSearch, el.filterType, el.filterAccount, el.filterCategory, el.filterDateFrom, el.filterDateTo, el.sortOrder]
  .forEach((control) => control.addEventListener("input", renderTransactions));

el.filterReset.addEventListener("click", () => {
  el.filterSearch.value = "";
  el.filterType.value = "";
  el.filterAccount.value = "";
  el.filterCategory.value = "";
  el.filterDateFrom.value = "";
  el.filterDateTo.value = "";
  el.sortOrder.value = "date-desc";
  renderTransactions();
});

// =====================================================================
// Запуск
// =====================================================================

el.transactionDate.value = todayISO();
el.transactionDate.max = todayISO();
el.transactionDate.min = LIMITS.minDate;
renderTransactionCategoryOptions();
reloadEverything();
