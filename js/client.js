/*
 * Сторінка члена родини (client.html):
 *   - перелік рахунків, відкритих для заявок («пропозиції») — GET /accounts;
 *   - форма заявки на витрату (зверстана; надсилання POST — етап 4);
 *   - перегляд статусу своїх заявок — GET /requests за ім'ям.
 *
 * Доступ до даних — лише через FinanceRepository; тут тільки інтерфейс.
 */
import { API_URL } from "./config.js";
import { HttpClient } from "./api.js";
import { FinanceRepository } from "./repository.js";
import { ACCOUNT_TYPES, LIMITS } from "./validation.js";
import { formatDateTime, formatMoney, normalizeName, toCents } from "./money.js";
import {
  clearGlobalError, clearMessage, escapeHtml, fillSelect, reportError, setBusy,
  showGlobalError, showMessage, stateBlock, stateRow, statusBadge,
} from "./ui.js";

const repository = new FinanceRepository(new HttpClient(API_URL));

// Дані з сервера та стан сторінки
const state = {
  accounts: [],     // усі рахунки (для назв у таблиці заявок)
  categories: [],   // усі категорії
  selectedAccountId: "",
  lookupName: "",   // ім'я, для якого показано заявки
};

const el = {
  globalError: document.querySelector("#global-error"),
  accountsList: document.querySelector("#accounts-list"),
  accountsRefresh: document.querySelector("#accounts-refresh"),

  form: document.querySelector("#request-form"),
  account: document.querySelector("#request-account"),
  category: document.querySelector("#request-category"),
  amount: document.querySelector("#request-amount"),
  message: document.querySelector("#request-message"),

  lookupForm: document.querySelector("#lookup-form"),
  lookupName: document.querySelector("#lookup-name"),
  myRequests: document.querySelector("#my-requests"),
  lookupMessage: document.querySelector("#lookup-message"),
};

const COLUMNS = 8;

// =====================================================================
// Завантаження даних
// =====================================================================

/** GET /accounts і GET /categories — рахунки й категорії для форми */
async function loadReferenceData() {
  el.accountsList.innerHTML = stateBlock("loading", "Завантаження рахунків…");
  try {
    const [accounts, categories] = await Promise.all([repository.getAccounts(), repository.getCategories()]);
    state.accounts = accounts;
    state.categories = categories;
    if (!openAccounts().some((a) => a.id === state.selectedAccountId)) state.selectedAccountId = "";
    clearGlobalError(el.globalError);
    renderAccounts();
    renderSelects();
  } catch (error) {
    showGlobalError(el.globalError, error.message);
    el.accountsList.innerHTML = stateBlock("error", `Не вдалося завантажити рахунки. ${error.message}`);
    renderSelects();
  }
}

/** GET заявок за ім'ям — показує актуальні статуси */
async function loadMyRequests() {
  if (!state.lookupName) return;
  el.myRequests.innerHTML = stateRow("loading", "Завантаження заявок…", COLUMNS);
  try {
    const requests = await repository.findRequestsByRequester(state.lookupName);
    clearGlobalError(el.globalError);
    renderMyRequests(requests);
  } catch (error) {
    el.myRequests.innerHTML = stateRow("error", `Не вдалося отримати заявки. ${error.message}`, COLUMNS);
    reportError(error, el.lookupMessage, el.globalError);
  }
}

// =====================================================================
// Рендер
// =====================================================================

const openAccounts = () => state.accounts.filter((a) => a.openForRequests);
const nameOf = (list, id) => (list.find((item) => item.id === id) || {}).name || "—";

function renderAccounts() {
  const accounts = openAccounts();
  if (accounts.length === 0) {
    el.accountsList.innerHTML = stateBlock("empty", "Зараз немає рахунків, відкритих для заявок.");
    return;
  }
  el.accountsList.innerHTML = accounts
    .map((a) => `
      <article class="account-card${a.id === state.selectedAccountId ? " selected" : ""}">
        <span class="type">${escapeHtml(ACCOUNT_TYPES[a.type] || a.type)}</span>
        <span class="name">${escapeHtml(a.name)}</span>
        <span class="balance${toCents(a.balance) === 0 ? " zero" : ""}">${formatMoney(a.balance)}</span>
        <div class="card-actions">
          <button type="button" class="btn-secondary btn-small" data-action="choose" data-id="${escapeHtml(a.id)}">Обрати для заявки</button>
        </div>
      </article>`)
    .join("");
}

function renderSelects() {
  fillSelect(
    el.account,
    '<option value="">— оберіть рахунок —</option>' +
      openAccounts()
        .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${formatMoney(a.balance)}</option>`)
        .join("")
  );
  if (state.selectedAccountId) el.account.value = state.selectedAccountId;

  fillSelect(
    el.category,
    '<option value="">— оберіть категорію —</option>' +
      state.categories
        .filter((c) => c.type === "expense")
        .sort((a, b) => a.name.localeCompare(b.name, "uk"))
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
        .join("")
  );
}

function renderMyRequests(requests) {
  if (requests.length === 0) {
    el.myRequests.innerHTML = stateRow("empty", `Заявок від «${state.lookupName}» не знайдено.`, COLUMNS);
    return;
  }
  el.myRequests.innerHTML = requests
    .map((r) => `
        <tr>
          <td class="nowrap">${formatDateTime(r.createdAt)}</td>
          <td>${escapeHtml(nameOf(state.accounts, r.accountId))}</td>
          <td>${escapeHtml(nameOf(state.categories, r.categoryId))}</td>
          <td>${escapeHtml(r.purpose)}</td>
          <td class="amount">${formatMoney(r.amount)}</td>
          <td>${statusBadge(r.status)}</td>
          <td class="muted">${escapeHtml(r.adminComment || "—")}</td>
          <td class="actions"></td>
        </tr>`)
    .join("");
}

function selectAccount(accountId) {
  state.selectedAccountId = accountId;
  el.account.value = accountId;
  renderAccounts();
}

// =====================================================================
// Обробники подій
// =====================================================================

el.accountsList.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="choose"]');
  if (!button) return;
  selectAccount(button.dataset.id);
  el.amount.focus();
});

el.account.addEventListener("change", () => selectAccount(el.account.value));

el.accountsRefresh.addEventListener("click", loadReferenceData);

// Форму зверстано; перевірку полів і POST /requests буде додано на етапі 4
el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  showMessage(el.message, "Надсилання заявки (POST /requests) з перевіркою полів буде реалізовано на етапі 4.", "info");
});

// Перегляд статусу: GET за ім'ям
el.lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(el.lookupMessage);
  const name = normalizeName(el.lookupName.value);
  if (name.length < LIMITS.nameMin) {
    showMessage(el.lookupMessage, `Введіть ім'я (щонайменше ${LIMITS.nameMin} символи).`);
    return;
  }
  state.lookupName = name;
  setBusy(el.lookupForm, true);
  await loadReferenceData();
  await loadMyRequests();
  setBusy(el.lookupForm, false);
});

// =====================================================================
// Запуск
// =====================================================================

loadReferenceData();
