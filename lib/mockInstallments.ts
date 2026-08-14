import type { InstallmentOption } from "@/types/payment";

export const MOCK_BANK = "CardFinans";

export const INSTALLMENT_BANKS = [
  "Axess",
  "Bankkart",
  "Bonus Card",
  "CardFinans",
  "Maximum",
  "Paraf",
  "World",
];

const RATES: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0.048,
  5: 0.0578,
  6: 0.0675,
  7: 0.0787,
  8: 0.0898,
  9: 0.101,
  10: 0.111,
  11: 0.121,
  12: 0.131,
};

const SELECT_COUNTS = [1, 2, 3, 4, 6, 9, 12];
const MODAL_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const round2 = (value: number) => Math.round(value * 100) / 100;

function build(amount: number, count: number): InstallmentOption {
  const total = amount * (1 + RATES[count]);
  return { count, monthly: round2(total / count), total: round2(total) };
}

export function getSelectInstallments(amount: number): InstallmentOption[] {
  return SELECT_COUNTS.map((count) => build(amount, count));
}

export function getModalInstallments(amount: number): InstallmentOption[] {
  return MODAL_COUNTS.map((count) => build(amount, count));
}
