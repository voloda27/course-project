/*
 * HttpClient — низькорівневий доступ до JSON Server через fetch.
 * Перевіряє response.ok і перетворює збої на зрозумілі помилки.
 * Предметних операцій тут немає — вони в repository.js.
 */
import { ConnectionError, HttpError, NotFoundError } from "./errors.js";

export class HttpClient {
  /**
   * @param {string} baseUrl  адреса API, напр. "http://localhost:5000"
   * @param {Function} fetchFn  функція fetch (у тестах можна підмінити)
   */
  constructor(baseUrl, fetchFn = (...args) => fetch(...args)) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  async request(path, { method = "GET", body } = {}) {
    const options = { method };
    if (body !== undefined) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, options);
    } catch (error) {
      // fetch кидає TypeError, коли сервер не відповідає взагалі
      throw new ConnectionError(
        "Немає з'єднання з сервером. Перевірте, чи запущений JSON Server (npm run server)."
      );
    }

    if (response.status === 404) {
      throw new NotFoundError("Запис не знайдено на сервері — можливо, його вже видалено.");
    }
    if (!response.ok) {
      throw new HttpError(response.status, `Сервер повернув помилку ${response.status}. Спробуйте ще раз.`);
    }

    // DELETE у JSON Server повертає {}, але порожню відповідь теж обробляємо
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  get(path) {
    return this.request(path);
  }

  post(path, body) {
    return this.request(path, { method: "POST", body });
  }

  patch(path, body) {
    return this.request(path, { method: "PATCH", body });
  }

  delete(path) {
    return this.request(path, { method: "DELETE" });
  }
}

/** Формує рядок запиту: { status: "new" } → "?status=new". Порожні значення пропускає. */
export function query(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.append(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}
