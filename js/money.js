/*
 * Допоміжні функції: гроші, дати, рядки. Без звернень до DOM і сервера,
 * тому їх перевіряють автотести.
 */

/*
 * Гроші рахуємо в копійках (цілих числах), щоб уникнути похибок
 * на кшталт 0.1 + 0.2 = 0.30000000000000004. У db.json зберігаємо гривні.
 */
export function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

const moneyFormatter = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1267.6 → «1 267,60 ₴» */
export function formatMoney(amount) {
  return `${moneyFormatter.format(amount)} ₴`;
}

/** 1267.6 → «1267,60» (для поля введення) */
export function formatAmountInput(amount) {
  return moneyFormatter.format(amount).replace(/\s/g, "");
}

/**
 * Розбирає суму, введену користувачем: дозволяє кому або крапку
 * та пробіли між розрядами. Повертає { value } або { error }.
 */
export function parseAmount(rawText) {
  const text = String(rawText ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { error: "empty" };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "format" };
  return { value: Number(text) };
}

/** «2026-10-24» → «24.10.2026» */
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/** ISO-час → «03.11.2026, 18:10» у місцевому часі */
export function formatDateTime(isoDateTime) {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Сьогоднішня дата в місцевому часовому поясі у форматі РРРР-ММ-ДД */
export function todayISO(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Перевіряє, що рядок — реальна дата (не 2026-02-31) */
export function isValidISODate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Обрізає пробіли по краях і зводить кілька пробілів до одного */
export function normalizeName(text) {
  return String(text ?? "").trim().replace(/\s+/g, " ");
}

/** Екранує спецсимволи для пошуку через RegExp (фільтр _like у JSON Server) */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
