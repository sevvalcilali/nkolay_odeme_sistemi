export type CardBrand = "visa" | "mastercard" | "troy";

export function detectBrand(digits: string): CardBrand | null {
  if (digits.startsWith("4")) return "visa";
  if (digits.startsWith("9792")) return "troy";

  if (digits.length >= 2) {
    const prefix = Number(digits.slice(0, 2));
    if (prefix >= 51 && prefix <= 55) return "mastercard";
  }

  if (digits.length >= 4) {
    const prefix = Number(digits.slice(0, 4));
    if (prefix >= 2221 && prefix <= 2720) return "mastercard";
  }

  return null;
}
