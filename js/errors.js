/*
 * Класи помилок. Інтерфейс за типом помилки вирішує, що показати
 * користувачу, і чи потрібне загальне повідомлення про сервер.
 */

/** Сервер не відповідає: JSON Server не запущений або недоступний. */
export class ConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConnectionError";
  }
}

/** Сервер відповів кодом помилки (4xx, 5xx). */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Запис не знайдено (HTTP 404). */
export class NotFoundError extends HttpError {
  constructor(message) {
    super(404, message);
    this.name = "NotFoundError";
  }
}

/** Порушено правило предметної області (недостатньо коштів, заборонений перехід статусу тощо). */
export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}
