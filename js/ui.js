/*
 * Спільні функції інтерфейсу для обох сторінок:
 * повідомлення, стани списків, блокування кнопок, екранування HTML.
 */
import { ConnectionError } from "./errors.js";

/** Захист від вставлення HTML у розмітку через назви чи коментарі */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Повідомлення під формою: type = "error" | "success" | "info" */
export function showMessage(element, text, type = "error") {
  element.textContent = text;
  element.className = `form-message ${type}`;
}

export function clearMessage(element) {
  element.textContent = "";
  element.className = "form-message";
}

/** Загальне повідомлення вгорі сторінки (про недоступність сервера) */
export function showGlobalError(element, text) {
  element.textContent = text;
  element.hidden = false;
}

export function clearGlobalError(element) {
  element.textContent = "";
  element.hidden = true;
}

/**
 * Єдине оброблення помилок у обробниках подій:
 * текст — біля дії, а проблема з сервером — ще й угорі сторінки.
 */
export function reportError(error, messageElement, globalElement) {
  showMessage(messageElement, error.message || "Невідома помилка.", "error");
  if (error instanceof ConnectionError && globalElement) {
    showGlobalError(globalElement, error.message);
  }
}

/** Блокує кнопки форми на час запиту, щоб уникнути подвійного надсилання */
export function setBusy(container, isBusy) {
  container.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

/** Стани списку: завантаження / порожньо / помилка — однаковий вигляд на обох сторінках */
export function stateBlock(kind, text) {
  return `<div class="state state-${kind}">${escapeHtml(text)}</div>`;
}

export function stateRow(kind, text, colspan) {
  return `<tr><td colspan="${colspan}">${stateBlock(kind, text)}</td></tr>`;
}

// Назви статусів заявки для відображення
const STATUS_LABELS = { new: "Нова", approved: "Схвалена", rejected: "Відхилена", cancelled: "Скасована" };

/** Мітка статусу заявки */
export function statusBadge(status) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

/** Відмінювання: 1 операція, 2 операції, 5 операцій */
export function plural(n, [one, few, many]) {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Заповнює <select>, зберігаючи вибране значення, якщо воно ще існує */
export function fillSelect(select, optionsHtml) {
  const previous = select.value;
  select.innerHTML = optionsHtml;
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  }
}
