/*
 * Курсовий проєкт «Особисті фінанси»
 * Автор: Цебенко В. В., група ІС-23-01
 *
 * Логіка сторінки: читання й зміна даних через JSON Server,
 * перевірка введення, правила предметної області, відображення.
 *
 * Розділи файлу:
 *   1. Налаштування та стан
 *   2. API — HTTP-запити до JSON Server
 *   3. Допоміжні функції
 *   4. Правила предметної області (validate…, перевірка балансу)
 *   5. Операції з даними (проведення, редагування, видалення)
 *   6. Рендер — відображення даних на сторінці
 *   7. Обробники подій
 *   8. Запуск
 */

// =====================================================================
// 1. НАЛАШТУВАННЯ ТА СТАН
// =====================================================================

const SERVER_URL = "http://localhost:5000";

// Підписи для типів, що зберігаються в db.json англійськими кодами
const ACCOUNT_TYPES = { cash: "Готівка", card: "Картка", savings: "Заощадження" };
const TRANSACTION_TYPES = { income: "Дохід", expense: "Витрата" };

// Обмеження з постановки завдання (docs/task.md, розділ 5)
const LIMITS = {
  accountNameMin: 2,
  accountNameMax: 40,
  accountBalanceMax: 10000000,
  categoryNameMin: 2,
  categoryNameMax: 30,
  amountMax: 1000000,
  commentMax: 100,
  minDate: "2000-01-01",
};

// Дані, отримані з сервера, і записи, які зараз редагуються
const state = {
  accounts: [],
  categories: [],
  transactions: [],
  loaded: false, // чи вдалося хоч раз отримати дані з сервера
  editingAccountId: null,
  editingCategoryId: null,
  editingTransactionId: null,
};

// Елементи сторінки, до яких звертаємося найчастіше
const el = {
  message: document.querySelector("#message"),

  accountsList: document.querySelector("#accounts-list"),
  accountForm: document.querySelector("#account-form"),
  accountFormTitle: document.querySelector("#account-form-title"),
  accountName: document.querySelector("#account-name"),
  accountType: document.querySelector("#account-type"),
  accountBalance: document.querySelector("#account-balance"),
  accountBalanceHint: document.querySelector("#account-balance-hint"),
  accountSubmit: document.querySelector("#account-submit"),
  accountCancel: document.querySelector("#account-cancel"),
  accountMessage: document.querySelector("#account-message"),

  categoriesExpense: document.querySelector("#categories-expense"),
  categoriesIncome: document.querySelector("#categories-income"),
  categoryForm: document.querySelector("#category-form"),
  categoryFormTitle: document.querySelector("#category-form-title"),
  categoryName: document.querySelector("#category-name"),
  categoryType: document.querySelector("#category-type"),
  categorySubmit: document.querySelector("#category-submit"),
  categoryCancel: document.querySelector("#category-cancel"),
  categoryMessage: document.querySelector("#category-message"),

  transactionForm: document.querySelector("#transaction-form"),
  transactionFormTitle: document.querySelector("#transaction-form-title"),
  transactionAmount: document.querySelector("#transaction-amount"),
  transactionDate: document.querySelector("#transaction-date"),
  transactionAccount: document.querySelector("#transaction-account"),
  transactionCategory: document.querySelector("#transaction-category"),
  transactionComment: document.querySelector("#transaction-comment"),
  transactionSubmit: document.querySelector("#transaction-submit"),
  transactionCancel: document.querySelector("#transaction-cancel"),
  transactionMessage: document.querySelector("#transaction-message"),

  transactionsList: document.querySelector("#transactions-list"),
  transactionsInfo: document.querySelector("#transactions-info"),
  transactionsListMessage: document.querySelector("#transactions-list-message"),

  filterSearch: document.querySelector("#filter-search"),
  filterType: document.querySelector("#filter-type"),
  filterAccount: document.querySelector("#filter-account"),
  filterCategory: document.querySelector("#filter-category"),
  filterDateFrom: document.querySelector("#filter-date-from"),
  filterDateTo: document.querySelector("#filter-date-to"),
  sortOrder: document.querySelector("#sort-order"),
  filterReset: document.querySelector("#filter-reset"),
};

// =====================================================================
// 2. API — HTTP-ЗАПИТИ ДО JSON SERVER
// =====================================================================

// Помилка з'єднання: сервер не запущений або недоступний
class ConnectionError extends Error {}

// Помилка правила предметної області (недостатньо коштів тощо)
class DomainError extends Error {}

/**
 * Базова функція запиту. Повертає розібраний JSON
 * або кидає зрозумілу українською помилку.
 */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (error) {
    // fetch кидає TypeError, коли сервер не відповідає взагалі
    throw new ConnectionError(
      "Немає з'єднання з сервером. Перевірте, чи запущений JSON Server " +
      "(npx json-server --watch db.json --port 5000)."
    );
  }

  if (response.status === 404) {
    throw new DomainError("Запис не знайдено на сервері — можливо, його вже видалено. Дані оновлено.");
  }
  if (!response.ok) {
    throw new Error(`Сервер повернув помилку ${response.status}. Спробуйте ще раз.`);
  }
  return response.json();
}

const api = {
  // GET /колекція
  getAll: (collection) => request(`/${collection}`),
  // GET /колекція?поле=значення (фільтр JSON Server)
  findBy: (collection, field, value) =>
    request(`/${collection}?${field}=${encodeURIComponent(value)}`),
  // GET /колекція/id
  getOne: (collection, id) => request(`/${collection}/${encodeURIComponent(id)}`),
  // POST /колекція
  create: (collection, data) =>
    request(`/${collection}`, { method: "POST", body: JSON.stringify(data) }),
  // PATCH /колекція/id
  update: (collection, id, data) =>
    request(`/${collection}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  // DELETE /колекція/id
  remove: (collection, id) =>
    request(`/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

// =====================================================================
// 3. ДОПОМІЖНІ ФУНКЦІЇ
// =====================================================================

/*
 * Гроші рахуємо в копійках (цілих числах), щоб уникнути похибок
 * на кшталт 0.1 + 0.2 = 0.30000000000000004. У db.json зберігаємо гривні.
 */
function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
  return cents / 100;
}

const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 1267.6 → «1 267,60 ₴»
function formatMoney(amount) {
  return `${moneyFormatter.format(amount)} ₴`;
}

// «2026-10-24» → «24.10.2026»
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

// Сьогоднішня дата в локальному часовому поясі у форматі РРРР-ММ-ДД
function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Перевіряє, що рядок — реальна дата (не 2026-02-31)
function isValidISODate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Розбирає суму, введену користувачем: дозволяє кому або крапку,
 * пробіли між розрядами. Повертає { value } або { error }.
 */
function parseAmount(rawText) {
  const text = rawText.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { error: "empty" };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "format" };
  return { value: Number(text) };
}

// Захист від вставлення HTML у розмітку через назви чи коментарі
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Показ повідомлення під формою: type = "error" | "success"
function showFormMessage(element, text, type = "error") {
  element.textContent = text;
  element.className = `form-message ${type}`;
}

function clearFormMessage(element) {
  element.textContent = "";
  element.className = "form-message";
}

// Загальне повідомлення вгорі сторінки
function showGlobalMessage(text) {
  el.message.textContent = text;
}

function clearGlobalMessage() {
  el.message.textContent = "";
}

/**
 * Єдине місце оброблення помилок у обробниках подій:
 * текст — під відповідною формою, а проблема з сервером — ще й угорі.
 */
function handleError(error, messageElement) {
  showFormMessage(messageElement, error.message, "error");
  if (error instanceof ConnectionError) {
    showGlobalMessage(error.message);
  }
}

// Блокує кнопки форми на час запиту, щоб уникнути подвійного надсилання
function setBusy(form, isBusy) {
  form.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function findById(collection, id) {
  return collection.find((item) => item.id === id);
}

function normalizeName(text) {
  return text.trim().replace(/\s+/g, " ");
}

function countWord(n) {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "операцій";
  if (last === 1) return "операція";
  if (last >= 2 && last <= 4) return "операції";
  return "операцій";
}

// =====================================================================
// 4. ПРАВИЛА ПРЕДМЕТНОЇ ОБЛАСТІ
// =====================================================================

/**
 * Перевірка рахунку. Повертає масив текстів помилок (порожній — усе гаразд).
 * Баланс перевіряється лише під час створення: далі він змінюється операціями.
 */
function validateAccount(input, editingId) {
  const errors = [];
  const name = normalizeName(input.name);

  if (name.length < LIMITS.accountNameMin || name.length > LIMITS.accountNameMax) {
    errors.push(`Назва рахунку має містити від ${LIMITS.accountNameMin} до ${LIMITS.accountNameMax} символів.`);
  } else {
    const duplicate = state.accounts.find(
      (account) => account.id !== editingId && account.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) errors.push(`Рахунок із назвою «${name}» уже існує.`);
  }

  if (!ACCOUNT_TYPES[input.type]) {
    errors.push("Оберіть тип рахунку.");
  }

  if (!editingId) {
    const parsed = input.balanceText.trim() === "" ? { value: 0 } : parseAmount(input.balanceText);
    if (parsed.error) {
      errors.push("Початковий баланс має бути невід'ємним числом з не більше ніж двома знаками після коми (напр., 1500,50).");
    } else if (parsed.value > LIMITS.accountBalanceMax) {
      errors.push(`Початковий баланс не може перевищувати ${formatMoney(LIMITS.accountBalanceMax)}.`);
    }
  }

  return errors;
}

/** Перевірка категорії. Тип не можна змінити, якщо за категорією вже є операції. */
function validateCategory(input, editingId) {
  const errors = [];
  const name = normalizeName(input.name);

  if (!TRANSACTION_TYPES[input.type]) {
    errors.push("Оберіть тип категорії.");
  }

  if (name.length < LIMITS.categoryNameMin || name.length > LIMITS.categoryNameMax) {
    errors.push(`Назва категорії має містити від ${LIMITS.categoryNameMin} до ${LIMITS.categoryNameMax} символів.`);
  } else {
    const duplicate = state.categories.find(
      (category) =>
        category.id !== editingId &&
        category.type === input.type &&
        category.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      errors.push(`Категорія «${name}» серед ${input.type === "income" ? "доходів" : "витрат"} уже існує.`);
    }
  }

  if (editingId) {
    const original = findById(state.categories, editingId);
    const used = state.transactions.filter((t) => t.categoryId === editingId).length;
    if (original && original.type !== input.type && used > 0) {
      errors.push(`Не можна змінити тип категорії «${original.name}»: за нею вже є ${used} ${countWord(used)}.`);
    }
  }

  return errors;
}

/** Перевірка полів операції (без перевірки балансу — вона окремо нижче). */
function validateTransaction(input) {
  const errors = [];

  if (!TRANSACTION_TYPES[input.type]) {
    errors.push("Оберіть тип операції.");
  }

  const parsed = parseAmount(input.amountText);
  if (parsed.error === "empty") {
    errors.push("Вкажіть суму операції.");
  } else if (parsed.error) {
    errors.push("Сума має бути додатним числом з не більше ніж двома знаками після коми (напр., 120,50).");
  } else if (parsed.value <= 0) {
    errors.push("Сума має бути більшою за 0.");
  } else if (parsed.value > LIMITS.amountMax) {
    errors.push(`Сума не може перевищувати ${formatMoney(LIMITS.amountMax)}.`);
  }

  if (input.date === "") {
    errors.push("Вкажіть дату операції.");
  } else if (!isValidISODate(input.date)) {
    errors.push("Дата має бути реальною датою у форматі ДД.ММ.РРРР.");
  } else if (input.date < LIMITS.minDate) {
    errors.push("Дата не може бути раніше за 01.01.2000.");
  } else if (input.date > todayISO()) {
    errors.push("Дата не може бути в майбутньому.");
  }

  if (!input.accountId) {
    errors.push("Оберіть рахунок.");
  } else if (!findById(state.accounts, input.accountId)) {
    errors.push("Обраного рахунку не існує. Оновіть сторінку.");
  }

  const category = findById(state.categories, input.categoryId);
  if (!input.categoryId) {
    errors.push("Оберіть категорію.");
  } else if (!category) {
    errors.push("Обраної категорії не існує. Оновіть сторінку.");
  } else if (category.type !== input.type) {
    errors.push(`Категорія «${category.name}» не відповідає типу операції.`);
  }

  if (input.comment.trim().length > LIMITS.commentMax) {
    errors.push(`Коментар не може бути довшим за ${LIMITS.commentMax} символів.`);
  }

  return errors;
}

/**
 * ГОЛОВНЕ ПРАВИЛО: витрату можна провести, лише якщо її сума
 * не перевищує поточний баланс рахунку (amount ≤ balance).
 * Повертає текст помилки або null.
 */
function validateFunds(account, type, amountCents) {
  if (type !== "expense") return null;
  const balanceCents = toCents(account.balance);
  if (amountCents > balanceCents) {
    return (
      `Недостатньо коштів на рахунку «${account.name}»: ` +
      `доступно ${formatMoney(fromCents(balanceCents))}, потрібно ${formatMoney(fromCents(amountCents))}. ` +
      "Операцію не проведено."
    );
  }
  return null;
}

// Вплив операції на баланс у копійках: дохід додає, витрата віднімає
function balanceEffectCents(transaction) {
  const cents = toCents(transaction.amount);
  return transaction.type === "income" ? cents : -cents;
}

/**
 * Скільки копійок треба додати до балансу кожного рахунку, коли
 * операцію oldT замінюють на newT (будь-яка з них може бути null).
 * Результат: { accountId: різниця }.
 */
function calcBalanceDeltas(oldT, newT) {
  const deltas = {};
  if (oldT) {
    deltas[oldT.accountId] = (deltas[oldT.accountId] || 0) - balanceEffectCents(oldT);
  }
  if (newT) {
    deltas[newT.accountId] = (deltas[newT.accountId] || 0) + balanceEffectCents(newT);
  }
  // Рахунки без змін не чіпаємо
  Object.keys(deltas).forEach((id) => {
    if (deltas[id] === 0) delete deltas[id];
  });
  return deltas;
}

/**
 * Бере свіжі баланси з сервера (GET /accounts/id) і перевіряє,
 * що жоден рахунок не піде в мінус. Повертає список змін балансу
 * або кидає DomainError із поясненням.
 */
async function prepareBalanceUpdates(deltas, describeProblem) {
  const updates = [];
  for (const [accountId, deltaCents] of Object.entries(deltas)) {
    const account = await api.getOne("accounts", accountId);
    const newCents = toCents(account.balance) + deltaCents;
    if (newCents < 0) {
      throw new DomainError(describeProblem(account, newCents));
    }
    updates.push({ account, newBalance: fromCents(newCents) });
  }
  return updates;
}

// Рахунок і категорію можна видалити, лише якщо з ними не пов'язано операцій
async function countLinkedTransactions(field, id) {
  const linked = await api.findBy("transactions", field, id);
  return linked.length;
}

// =====================================================================
// 5. ОПЕРАЦІЇ З ДАНИМИ
// =====================================================================

/**
 * Записує нові баланси на сервер. Якщо якийсь запит не вдався,
 * повертає попередні значення вже змінених рахунків і кидає помилку.
 */
async function applyBalanceUpdates(updates) {
  const applied = [];
  try {
    for (const { account, newBalance } of updates) {
      await api.update("accounts", account.id, { balance: newBalance });
      applied.push(account);
    }
  } catch (error) {
    await rollbackBalances(applied);
    throw error;
  }
  return applied;
}

// Повернення попередніх балансів (найкраща спроба, помилки ігноруються)
async function rollbackBalances(accounts) {
  for (const account of accounts) {
    try {
      await api.update("accounts", account.id, { balance: account.balance });
    } catch (ignored) {
      // Якщо сервер недоступний, повернути баланс неможливо
    }
  }
}

/**
 * ОСНОВНА ОПЕРАЦІЯ: проведення доходу або витрати.
 * 1) бере актуальний баланс рахунку з сервера;
 * 2) перевіряє головне правило (для витрати amount ≤ balance);
 * 3) змінює баланс рахунку і зберігає операцію.
 */
async function conductTransaction(data) {
  const account = await api.getOne("accounts", data.accountId);

  const fundsError = validateFunds(account, data.type, toCents(data.amount));
  if (fundsError) throw new DomainError(fundsError);

  const newBalance = fromCents(toCents(account.balance) + balanceEffectCents(data));
  const applied = await applyBalanceUpdates([{ account, newBalance }]);

  try {
    await api.create("transactions", data);
  } catch (error) {
    await rollbackBalances(applied);
    throw error;
  }
  return { account, newBalance };
}

/**
 * Редагування операції: скасовуємо вплив старої версії й застосовуємо
 * вплив нової. Якщо баланс якогось рахунку став би від'ємним — відмова.
 */
async function editTransaction(id, data) {
  const oldTransaction = await api.getOne("transactions", id);
  const deltas = calcBalanceDeltas(oldTransaction, data);

  const updates = await prepareBalanceUpdates(deltas, (account, newCents) => {
    const available = toCents(account.balance) +
      (oldTransaction.accountId === account.id ? balanceEffectCents(oldTransaction) * -1 : 0);
    return (
      `Недостатньо коштів на рахунку «${account.name}»: після зміни баланс став би ` +
      `${formatMoney(fromCents(newCents))}. Доступно для цієї операції: ${formatMoney(fromCents(Math.max(available, 0)))}. ` +
      "Зміни не збережено."
    );
  });

  const applied = await applyBalanceUpdates(updates);
  try {
    await api.update("transactions", id, data);
  } catch (error) {
    await rollbackBalances(applied);
    throw error;
  }
}

/**
 * Видалення (скасування) операції: витрату повертаємо на рахунок,
 * дохід знімаємо. Дохід не можна видалити, якщо ці гроші вже витрачено.
 */
async function deleteTransaction(id) {
  const transaction = await api.getOne("transactions", id);
  const deltas = calcBalanceDeltas(transaction, null);

  const updates = await prepareBalanceUpdates(deltas, (account) =>
    `Неможливо видалити дохід ${formatMoney(transaction.amount)}: на рахунку «${account.name}» ` +
    `лише ${formatMoney(account.balance)}, частину цих коштів уже витрачено. ` +
    "Спершу видаліть або змініть пов'язані витрати."
  );

  const applied = await applyBalanceUpdates(updates);
  try {
    await api.remove("transactions", id);
  } catch (error) {
    await rollbackBalances(applied);
    throw error;
  }
}

/** Завантаження всіх колекцій і повне оновлення сторінки. */
async function loadAll() {
  try {
    const [accounts, categories, transactions] = await Promise.all([
      api.getAll("accounts"),
      api.getAll("categories"),
      api.getAll("transactions"),
    ]);
    state.accounts = accounts;
    state.categories = categories;
    state.transactions = transactions;
    state.loaded = true;
    clearGlobalMessage();
  } catch (error) {
    showGlobalMessage(error.message);
  }
  resetMissingEditing();
  renderAll();
}

// Якщо запис, що редагувався, уже не існує — повертаємо форму в режим додавання
function resetMissingEditing() {
  if (state.editingAccountId && !findById(state.accounts, state.editingAccountId)) resetAccountForm();
  if (state.editingCategoryId && !findById(state.categories, state.editingCategoryId)) resetCategoryForm();
  if (state.editingTransactionId && !findById(state.transactions, state.editingTransactionId)) resetTransactionForm();
}

// =====================================================================
// 6. РЕНДЕР
// =====================================================================

function renderAll() {
  renderAccounts();
  renderCategories();
  renderSelectOptions();
  renderTransactions();
}

// Текст для порожнього списку: «немає записів» або «дані не завантажено»
function emptyText(normalText) {
  return state.loaded ? normalText : "Дані не завантажено: сервер недоступний.";
}

function renderAccounts() {
  if (state.accounts.length === 0) {
    el.accountsList.innerHTML = `<p class="empty">${emptyText("Рахунків ще немає. Додайте перший рахунок нижче.")}</p>`;
    return;
  }

  el.accountsList.innerHTML = state.accounts
    .map((account) => {
      const editing = account.id === state.editingAccountId ? " editing" : "";
      const zero = toCents(account.balance) === 0 ? " zero" : "";
      return `
        <article class="account-card${editing}">
          <span class="type">${escapeHtml(ACCOUNT_TYPES[account.type] || account.type)}</span>
          <span class="name">${escapeHtml(account.name)}</span>
          <span class="balance${zero}">${formatMoney(account.balance)}</span>
          <div class="card-actions">
            <button type="button" class="btn-secondary btn-small" data-action="edit-account" data-id="${escapeHtml(account.id)}">Редагувати</button>
            <button type="button" class="btn-danger btn-small" data-action="delete-account" data-id="${escapeHtml(account.id)}">Видалити</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderCategories() {
  const renderList = (type) => {
    const items = state.categories
      .filter((category) => category.type === type)
      .sort((a, b) => a.name.localeCompare(b.name, "uk"));

    if (items.length === 0) return `<li class="empty">${emptyText("Немає категорій")}</li>`;

    return items
      .map((category) => {
        const used = state.transactions.filter((t) => t.categoryId === category.id).length;
        const editing = category.id === state.editingCategoryId ? ' class="editing"' : "";
        return `
          <li${editing}>
            <span>${escapeHtml(category.name)} <span class="count">· ${used} ${countWord(used)}</span></span>
            <span class="card-actions">
              <button type="button" class="btn-secondary btn-small" data-action="edit-category" data-id="${escapeHtml(category.id)}">Змінити</button>
              <button type="button" class="btn-danger btn-small" data-action="delete-category" data-id="${escapeHtml(category.id)}">Видалити</button>
            </span>
          </li>`;
      })
      .join("");
  };

  el.categoriesExpense.innerHTML = renderList("expense");
  el.categoriesIncome.innerHTML = renderList("income");
}

// Заповнює список <select>, зберігаючи вибране значення, якщо воно ще існує
function fillSelect(select, optionsHtml) {
  const previous = select.value;
  select.innerHTML = optionsHtml;
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function categoryOptions(categories) {
  return categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "uk"))
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
}

function renderSelectOptions() {
  // Рахунки у формі операції — з поточним балансом
  fillSelect(
    el.transactionAccount,
    '<option value="">— оберіть рахунок —</option>' +
      state.accounts
        .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${formatMoney(a.balance)}</option>`)
        .join("")
  );

  renderTransactionCategoryOptions();

  // Фільтри журналу
  fillSelect(
    el.filterAccount,
    '<option value="">Усі</option>' +
      state.accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("")
  );

  const expense = state.categories.filter((c) => c.type === "expense");
  const income = state.categories.filter((c) => c.type === "income");
  fillSelect(
    el.filterCategory,
    '<option value="">Усі</option>' +
      `<optgroup label="Витрати">${categoryOptions(expense)}</optgroup>` +
      `<optgroup label="Доходи">${categoryOptions(income)}</optgroup>`
  );
}

// У формі операції показуємо лише категорії обраного типу
function renderTransactionCategoryOptions() {
  const type = getSelectedTransactionType();
  const suitable = state.categories.filter((c) => c.type === type);
  fillSelect(el.transactionCategory, '<option value="">— оберіть категорію —</option>' + categoryOptions(suitable));
}

/** Пошук, фільтрування та сортування журналу операцій. */
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
      const category = findById(state.categories, t.categoryId);
      const text = `${t.comment || ""} ${category ? category.name : ""}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const [field, direction] = el.sortOrder.value.split("-");
  const sign = direction === "asc" ? 1 : -1;
  result.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    const byAmount = toCents(a.amount) - toCents(b.amount);
    const primary = field === "amount" ? byAmount : byDate;
    const secondary = field === "amount" ? byDate : byAmount;
    return sign * (primary || secondary);
  });

  return result;
}

function renderTransactions() {
  const visible = getVisibleTransactions();
  const total = state.transactions.length;

  let info = `Показано ${visible.length} з ${total} ${countWord(total)}.`;
  if (el.filterDateFrom.value && el.filterDateTo.value && el.filterDateFrom.value > el.filterDateTo.value) {
    info += " Увага: дата «від» пізніша за дату «до».";
  }
  el.transactionsInfo.textContent = info;

  if (visible.length === 0) {
    el.transactionsList.innerHTML = `<tr><td colspan="7" class="empty">${
      total === 0 ? emptyText("Операцій ще немає.") : "Немає операцій, що відповідають умовам пошуку."
    }</td></tr>`;
    return;
  }

  el.transactionsList.innerHTML = visible
    .map((t) => {
      const account = findById(state.accounts, t.accountId);
      const category = findById(state.categories, t.categoryId);
      const sign = t.type === "income" ? "+" : "−";
      const editing = t.id === state.editingTransactionId ? ' class="editing"' : "";
      return `
        <tr${editing}>
          <td>${formatDate(t.date)}</td>
          <td><span class="badge ${t.type}">${TRANSACTION_TYPES[t.type]}</span></td>
          <td>${category ? escapeHtml(category.name) : "—"}</td>
          <td>${account ? escapeHtml(account.name) : "—"}</td>
          <td class="comment">${escapeHtml(t.comment || "")}</td>
          <td class="amount ${t.type}">${sign}${formatMoney(t.amount)}</td>
          <td class="actions">
            <button type="button" class="btn-secondary btn-small" data-action="edit-transaction" data-id="${escapeHtml(t.id)}">Змінити</button>
            <button type="button" class="btn-danger btn-small" data-action="delete-transaction" data-id="${escapeHtml(t.id)}">Видалити</button>
          </td>
        </tr>`;
    })
    .join("");
}

// ---------- Стан форм (режим додавання / редагування) ----------

function resetAccountForm() {
  state.editingAccountId = null;
  el.accountForm.reset();
  el.accountBalance.disabled = false;
  el.accountBalanceHint.hidden = true;
  el.accountFormTitle.textContent = "Новий рахунок";
  el.accountSubmit.textContent = "Додати рахунок";
  el.accountCancel.hidden = true;
}

function resetCategoryForm() {
  state.editingCategoryId = null;
  el.categoryForm.reset();
  el.categoryFormTitle.textContent = "Нова категорія";
  el.categorySubmit.textContent = "Додати категорію";
  el.categoryCancel.hidden = true;
}

function resetTransactionForm() {
  state.editingTransactionId = null;
  el.transactionForm.reset();
  el.transactionDate.value = todayISO();
  el.transactionFormTitle.textContent = "Нова операція";
  el.transactionSubmit.textContent = "Провести операцію";
  el.transactionCancel.hidden = true;
  renderTransactionCategoryOptions();
}

function getSelectedTransactionType() {
  const checked = el.transactionForm.querySelector('input[name="transaction-type"]:checked');
  return checked ? checked.value : "";
}

// =====================================================================
// 7. ОБРОБНИКИ ПОДІЙ
// =====================================================================

// ---------- Рахунки ----------

el.accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage(el.accountMessage);

  const input = {
    name: el.accountName.value,
    type: el.accountType.value,
    balanceText: el.accountBalance.value,
  };
  const editingId = state.editingAccountId;

  const errors = validateAccount(input, editingId);
  if (errors.length > 0) {
    showFormMessage(el.accountMessage, errors.join("\n"));
    return;
  }

  const name = normalizeName(input.name);
  setBusy(el.accountForm, true);
  try {
    if (editingId) {
      // Баланс вручну не змінюємо — лише назву й тип
      await api.update("accounts", editingId, { name, type: input.type });
      resetAccountForm();
      showFormMessage(el.accountMessage, `Рахунок «${name}» оновлено.`, "success");
    } else {
      const balance = input.balanceText.trim() === "" ? 0 : parseAmount(input.balanceText).value;
      await api.create("accounts", { name, type: input.type, balance });
      resetAccountForm();
      showFormMessage(el.accountMessage, `Рахунок «${name}» додано.`, "success");
    }
    await loadAll();
  } catch (error) {
    handleError(error, el.accountMessage);
    if (error instanceof DomainError) await loadAll();
  } finally {
    setBusy(el.accountForm, false);
  }
});

el.accountCancel.addEventListener("click", () => {
  resetAccountForm();
  clearFormMessage(el.accountMessage);
  renderAccounts();
});

el.accountsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const account = findById(state.accounts, button.dataset.id);
  if (!account) return;

  if (button.dataset.action === "edit-account") {
    state.editingAccountId = account.id;
    el.accountName.value = account.name;
    el.accountType.value = account.type;
    el.accountBalance.value = moneyFormatter.format(account.balance);
    el.accountBalance.disabled = true;
    el.accountBalanceHint.hidden = false;
    el.accountFormTitle.textContent = `Редагування рахунку «${account.name}»`;
    el.accountSubmit.textContent = "Зберегти зміни";
    el.accountCancel.hidden = false;
    clearFormMessage(el.accountMessage);
    renderAccounts();
    el.accountName.focus();
  }

  if (button.dataset.action === "delete-account") {
    clearFormMessage(el.accountMessage);
    try {
      // Обов'язкова перевірка: JSON Server сам видалив би всі операції рахунку
      const linked = await countLinkedTransactions("accountId", account.id);
      if (linked > 0) {
        showFormMessage(
          el.accountMessage,
          `Неможливо видалити рахунок «${account.name}»: з ним пов'язано ${linked} ${countWord(linked)}. ` +
            "Спершу видаліть ці операції."
        );
        return;
      }
      const balanceNote = toCents(account.balance) > 0 ? ` На ньому ${formatMoney(account.balance)}.` : "";
      if (!confirm(`Видалити рахунок «${account.name}»?${balanceNote}`)) return;

      await api.remove("accounts", account.id);
      if (state.editingAccountId === account.id) resetAccountForm();
      showFormMessage(el.accountMessage, `Рахунок «${account.name}» видалено.`, "success");
      await loadAll();
    } catch (error) {
      handleError(error, el.accountMessage);
      if (error instanceof DomainError) await loadAll();
    }
  }
});

// ---------- Категорії ----------

el.categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage(el.categoryMessage);

  const input = { name: el.categoryName.value, type: el.categoryType.value };
  const editingId = state.editingCategoryId;

  const errors = validateCategory(input, editingId);
  if (errors.length > 0) {
    showFormMessage(el.categoryMessage, errors.join("\n"));
    return;
  }

  const name = normalizeName(input.name);
  setBusy(el.categoryForm, true);
  try {
    if (editingId) {
      await api.update("categories", editingId, { name, type: input.type });
      resetCategoryForm();
      showFormMessage(el.categoryMessage, `Категорію «${name}» оновлено.`, "success");
    } else {
      await api.create("categories", { name, type: input.type });
      resetCategoryForm();
      showFormMessage(el.categoryMessage, `Категорію «${name}» додано.`, "success");
    }
    await loadAll();
  } catch (error) {
    handleError(error, el.categoryMessage);
    if (error instanceof DomainError) await loadAll();
  } finally {
    setBusy(el.categoryForm, false);
  }
});

el.categoryCancel.addEventListener("click", () => {
  resetCategoryForm();
  clearFormMessage(el.categoryMessage);
  renderCategories();
});

// Один обробник для обох списків категорій (витрати й доходи)
async function onCategoryListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const category = findById(state.categories, button.dataset.id);
  if (!category) return;

  if (button.dataset.action === "edit-category") {
    state.editingCategoryId = category.id;
    el.categoryName.value = category.name;
    el.categoryType.value = category.type;
    el.categoryFormTitle.textContent = `Редагування категорії «${category.name}»`;
    el.categorySubmit.textContent = "Зберегти зміни";
    el.categoryCancel.hidden = false;
    clearFormMessage(el.categoryMessage);
    renderCategories();
    el.categoryName.focus();
  }

  if (button.dataset.action === "delete-category") {
    clearFormMessage(el.categoryMessage);
    try {
      const linked = await countLinkedTransactions("categoryId", category.id);
      if (linked > 0) {
        showFormMessage(
          el.categoryMessage,
          `Неможливо видалити категорію «${category.name}»: за нею є ${linked} ${countWord(linked)}.`
        );
        return;
      }
      if (!confirm(`Видалити категорію «${category.name}»?`)) return;

      await api.remove("categories", category.id);
      if (state.editingCategoryId === category.id) resetCategoryForm();
      showFormMessage(el.categoryMessage, `Категорію «${category.name}» видалено.`, "success");
      await loadAll();
    } catch (error) {
      handleError(error, el.categoryMessage);
      if (error instanceof DomainError) await loadAll();
    }
  }
}

el.categoriesExpense.addEventListener("click", onCategoryListClick);
el.categoriesIncome.addEventListener("click", onCategoryListClick);

// ---------- Операції ----------

// Зміна типу операції перебудовує список категорій
el.transactionForm.querySelectorAll('input[name="transaction-type"]').forEach((radio) => {
  radio.addEventListener("change", renderTransactionCategoryOptions);
});

el.transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage(el.transactionMessage);

  const input = {
    type: getSelectedTransactionType(),
    amountText: el.transactionAmount.value,
    date: el.transactionDate.value,
    accountId: el.transactionAccount.value,
    categoryId: el.transactionCategory.value,
    comment: el.transactionComment.value,
  };

  const errors = validateTransaction(input);
  if (errors.length > 0) {
    showFormMessage(el.transactionMessage, errors.join("\n"));
    return;
  }

  // Дані у форматі db.json
  const data = {
    type: input.type,
    amount: parseAmount(input.amountText).value,
    date: input.date,
    accountId: input.accountId,
    categoryId: input.categoryId,
    comment: input.comment.trim(),
  };

  const editingId = state.editingTransactionId;
  setBusy(el.transactionForm, true);
  try {
    if (editingId) {
      await editTransaction(editingId, data);
      resetTransactionForm();
      showFormMessage(el.transactionMessage, "Операцію змінено, баланси рахунків перераховано.", "success");
    } else {
      const { account, newBalance } = await conductTransaction(data);
      const what = data.type === "income" ? "Дохід" : "Витрату";
      resetTransactionForm();
      showFormMessage(
        el.transactionMessage,
        `${what} ${formatMoney(data.amount)} проведено. Баланс «${account.name}»: ${formatMoney(newBalance)}.`,
        "success"
      );
    }
    await loadAll();
  } catch (error) {
    handleError(error, el.transactionMessage);
    // Після відмови показуємо актуальні баланси з сервера
    if (error instanceof DomainError) await loadAll();
  } finally {
    setBusy(el.transactionForm, false);
  }
});

el.transactionCancel.addEventListener("click", () => {
  resetTransactionForm();
  clearFormMessage(el.transactionMessage);
  renderTransactions();
});

el.transactionsList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const transaction = findById(state.transactions, button.dataset.id);
  if (!transaction) return;

  if (button.dataset.action === "edit-transaction") {
    state.editingTransactionId = transaction.id;
    el.transactionForm.querySelector(`input[value="${transaction.type}"]`).checked = true;
    renderTransactionCategoryOptions();
    el.transactionAmount.value = moneyFormatter.format(transaction.amount).replace(/\s/g, "");
    el.transactionDate.value = transaction.date;
    el.transactionAccount.value = transaction.accountId;
    el.transactionCategory.value = transaction.categoryId;
    el.transactionComment.value = transaction.comment || "";
    el.transactionFormTitle.textContent = `Редагування операції від ${formatDate(transaction.date)}`;
    el.transactionSubmit.textContent = "Зберегти зміни";
    el.transactionCancel.hidden = false;
    clearFormMessage(el.transactionMessage);
    renderTransactions();
    el.transactionAmount.focus();
  }

  if (button.dataset.action === "delete-transaction") {
    clearFormMessage(el.transactionsListMessage);
    const account = findById(state.accounts, transaction.accountId);
    const effect = transaction.type === "income" ? "знято з рахунку" : "повернено на рахунок";
    const question =
      `Видалити операцію ${TRANSACTION_TYPES[transaction.type].toLowerCase()} ${formatMoney(transaction.amount)} ` +
      `від ${formatDate(transaction.date)}?\nСуму буде ${effect} «${account ? account.name : "—"}».`;
    if (!confirm(question)) return;

    try {
      await deleteTransaction(transaction.id);
      if (state.editingTransactionId === transaction.id) resetTransactionForm();
      showFormMessage(el.transactionsListMessage, "Операцію видалено, баланс рахунку скориговано.", "success");
      await loadAll();
    } catch (error) {
      handleError(error, el.transactionsListMessage);
      if (error instanceof DomainError) await loadAll();
    }
  }
});

// ---------- Пошук, фільтри, сортування ----------

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
// 8. ЗАПУСК
// =====================================================================

el.transactionDate.value = todayISO();
el.transactionDate.max = todayISO();
el.transactionDate.min = LIMITS.minDate;
loadAll();
