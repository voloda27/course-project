/*
 * Довідники типів і обмеження полів (docs/task.md, розділ 5).
 * Функції перевірки введення додаються разом із формами збереження (етап 4).
 */

export const ACCOUNT_TYPES = { cash: "Готівка", card: "Картка", savings: "Заощадження" };
export const TRANSACTION_TYPES = { income: "Дохід", expense: "Витрата" };

export const LIMITS = {
  nameMin: 2,
  accountNameMax: 40,
  categoryNameMax: 30,
  requesterNameMax: 40,
  accountBalanceMax: 10000000,
  amountMax: 1000000,
  commentMax: 100,
  purposeMin: 3,
  purposeMax: 100,
  reasonMin: 3,
  reasonMax: 100,
  minDate: "2000-01-01",
};
