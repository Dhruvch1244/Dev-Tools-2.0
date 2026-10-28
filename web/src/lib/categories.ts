export const EXPENSE_CATEGORIES = [
  { name: 'Food', emoji: '🍜' },
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Transport', emoji: '🚕' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Bills', emoji: '🧾' },
  { name: 'Rent', emoji: '🏠' },
  { name: 'Health', emoji: '💊' },
  { name: 'Fun', emoji: '🎬' },
  { name: 'Travel', emoji: '✈️' },
  { name: 'Other', emoji: '✨' },
];

export const INCOME_CATEGORIES = [
  { name: 'Salary', emoji: '💼' },
  { name: 'Freelance', emoji: '🧑‍💻' },
  { name: 'Gift', emoji: '🎁' },
  { name: 'Refund', emoji: '↩️' },
  { name: 'Other', emoji: '✨' },
];

export const emojiFor = (category: string) =>
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.name === category)?.emoji ?? '✨';

export const NOTE_COLORS = [
  { name: 'none', value: null },
  { name: 'violet', value: '#8f7dff' },
  { name: 'pink', value: '#ff7ac6' },
  { name: 'mint', value: '#4fe3c1' },
  { name: 'amber', value: '#ffb547' },
  { name: 'sky', value: '#5cb8ff' },
];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'SGD'];
