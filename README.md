# Сімейний бюджет («Особисті фінанси»)

Курсовий проєкт з дисципліни «Конструювання програмного забезпечення».

- **Автор:** Цебенко Володимир Володимирович, група ІС-23-01
- **Керівник:** Ковальчук В. Я.
- **Тема:** № 22 «Особисті фінанси»
- **Рівень складності:** ІІІ — достатній (7–9 балів)
- **Версія:** 0.3.0 (етап 3 — верстка макетів сторінок)

## Призначення

Вебзастосунок для спільного бюджету родини. Він має дві сторінки, які працюють з одними даними через JSON Server:

- **`client.html` — член родини:** рахунки, відкриті для заявок, форма заявки на витрату, перегляд статусу своїх заявок.
- **`admin.html` — власник бюджету:** перелік заявок, рахунки з формою редагування, журнал операцій з пошуком, фільтрами та сортуванням, категорії.

Усі дані — вигадані навчальні. Вхід і ролі не передбачені; дві сторінки не є захистом доступу.

## Стан етапу 3

- Обидві сторінки зверстано за спільними стилями (`css/styles.css`), з адаптивним макетом.
- Кожна сторінка виконує `GET` до JSON Server і показує отримані записи. Є стани «Завантаження…», «порожньо» й «помилка», а при зупиненому сервері — банер угорі.
- Адреса API зберігається лише в `js/config.js`. `HttpClient` перевіряє `response.ok`; дані сторінки отримують через `FinanceRepository`.
- Для повідомлень валідації та успіху підготовлено місця, видалення рахунку запитує підтвердження. Збереження змін (POST, PATCH, DELETE) і зміна статусу заявок — етап 4.

## Технології

| Засіб | Версія | Для чого |
| --- | --- | --- |
| HTML, CSS, JavaScript | ES-модулі, без фреймворків | Сторінки й логіка |
| Node.js | LTS | Запуск JSON Server |
| [JSON Server](https://github.com/typicode/json-server/tree/v0.17.4) | **0.17.4** (`devDependencies`, зафіксовано в `package-lock.json`) | REST API над `db.json` |
| Live Server (VS Code, Ritwick Dey) | — | HTTP-сервер для сторінок |
| Git | — | Історія змін |

## Запуск

Команди виконуються в терміналі VS Code, відкритому **в папці `course-project`**.

1. Встановіть залежності (один раз):
   ```
   npm install
   ```
2. Запустіть JSON Server і не закривайте цей термінал:
   ```
   npm run server
   ```
   Це те саме, що `npx json-server --watch db.json --port 5000` (команда для встановленої версії 0.17.4). Має з'явитися список `Resources`.
3. Клацніть правою кнопкою по `index.html` → **Open with Live Server** і оберіть сторінку.

### Адреси

| Що | Адреса |
| --- | --- |
| Головна сторінка | `http://127.0.0.1:5500/index.html` |
| Сторінка члена родини | `http://127.0.0.1:5500/client.html` |
| Сторінка власника бюджету | `http://127.0.0.1:5500/admin.html` |
| API (JSON Server) | `http://localhost:5000` — `/accounts`, `/categories`, `/transactions`, `/requests` |

Live Server віддає HTML, CSS і JavaScript, а JSON Server надає API до `db.json` — це два різні сервери. Сторінки треба відкривати через Live Server, а не подвійним кліком: ES-модулі й `fetch` не працюють з адресою `file://`.

Щоб Live Server не перезавантажував сторінку після кожного запису в `db.json`, у файлі `.vscode/settings.json` має бути:

```json
{ "liveServer.settings.ignoreFiles": [".vscode/**", "db.json", "package.json", "package-lock.json", "node_modules/**", "docs/**", "**/*.md"] }
```

### Перевірка етапу 3

1. Відкрийте `client.html` і `admin.html`. У DevTools → Network видно запити `GET /accounts`, `GET /categories`, `GET /requests`, `GET /transactions` до `localhost:5000`.
2. На `client.html` у «Мої заявки» введіть «Олена» і натисніть «Оновити» — з'явиться `GET /requests?requesterName_like=…` і заявки з їхніми статусами.
3. Зупиніть JSON Server (Ctrl+C) і оновіть сторінки — з'явиться червоний банер «Немає з'єднання з сервером. Перевірте, чи запущений JSON Server», а списки покажуть стан помилки.

## Структура

```
course-project/
├── index.html            — головна: вибір сторінки
├── client.html           — сторінка члена родини
├── admin.html            — сторінка власника бюджету
├── css/styles.css        — спільні стилі
├── js/
│   ├── config.js         — API_URL (єдине місце)
│   ├── api.js            — HttpClient: fetch, перевірка response.ok
│   ├── errors.js         — ConnectionError, NotFoundError, HttpError, DomainError
│   ├── repository.js     — патерн Repository (методи читання)
│   ├── validation.js     — довідники типів і обмеження полів
│   ├── money.js          — гроші в копійках, формати
│   ├── ui.js             — повідомлення, стани списків
│   ├── client.js         — логіка client.html
│   └── admin.js          — логіка admin.html
├── db.json               — дані JSON Server: accounts, categories, transactions, requests
├── docs/
│   ├── task.md           — постановка завдання, вимоги ФВ/НФВ
│   ├── design.md         — архітектура, макети, обґрунтування патернів
│   ├── uml/              — UML: прецеденти, класи (дані, структура з учасниками патернів), стани заявки
│   └── screenshots/      — скриншоти обох сторінок
├── package.json, package-lock.json
└── .gitignore
```

## Патерни (спроєктовано)

| Патерн | Файл | Призначення |
| --- | --- | --- |
| Repository | `js/repository.js` | Предметні операції над рахунками, заявками, операціями й категоріями; сторінки не знають адрес API. Етап 3 — читання, етап 4 — зміни з перевіркою правил |
| State (GoF) | `js/request-states.js` (етап 4) | Статус заявки — окремий об'єкт стану з дозволеними переходами: Нова → Схвалена / Відхилена / Скасована |

Обґрунтування — у [docs/design.md](docs/design.md), учасники патернів — на діаграмі [docs/uml/class-structure.png](docs/uml/class-structure.png).

## Скриншоти

- [docs/screenshots/01-client.png](docs/screenshots/01-client.png) — сторінка члена родини;
- [docs/screenshots/02-admin.png](docs/screenshots/02-admin.png) — сторінка власника бюджету;
- [docs/screenshots/08-client-server-down.png](docs/screenshots/08-client-server-down.png), [09-admin-server-down.png](docs/screenshots/09-admin-server-down.png) — повідомлення про зупинений JSON Server.
