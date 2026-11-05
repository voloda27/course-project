/*
 * Патерн Repository: шар операцій над сутностями.
 *
 * Сторінки (client.js, admin.js) не знають адрес API і не викликають fetch —
 * вони працюють з методами на кшталт getAccounts(), getRequests().
 * Репозиторій формує HTTP-запити через HttpClient; відображення HTML тут немає.
 *
 * Етап 3: операції читання (GET).
 * Етап 4: операції зміни — createRequest, updateRequestStatus, керування рахунками,
 * категоріями й операціями з перевіркою предметних правил (див. docs/design.md).
 */
import { query } from "./api.js";
import { escapeRegExp, normalizeName } from "./money.js";

const id = (value) => encodeURIComponent(value);

export class FinanceRepository {
  /** @param {import("./api.js").HttpClient} http */
  constructor(http) {
    this.http = http;
  }

  // ----- Рахунки («пропозиції» для клієнта) -----

  getAccounts() {
    return this.http.get("/accounts");
  }

  getAccount(accountId) {
    return this.http.get(`/accounts/${id(accountId)}`);
  }

  // ----- Категорії -----

  getCategories() {
    return this.http.get("/categories");
  }

  // ----- Операції -----

  getTransactions() {
    return this.http.get("/transactions");
  }

  // ----- Заявки на витрату -----

  /** Усі заявки (новіші спочатку); status — необов'язковий фільтр на сервері */
  getRequests({ status } = {}) {
    return this.http.get(`/requests${query({ status, _sort: "createdAt", _order: "desc" })}`);
  }

  getRequest(requestId) {
    return this.http.get(`/requests/${id(requestId)}`);
  }

  /** Заявки однієї людини (ім'я без урахування регістру, точний збіг) */
  findRequestsByRequester(name) {
    const pattern = `^${escapeRegExp(normalizeName(name))}$`;
    return this.http.get(`/requests${query({ requesterName_like: pattern, _sort: "createdAt", _order: "desc" })}`);
  }
}
