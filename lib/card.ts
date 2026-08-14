// Kart alani maskeleme yardimcilari. State daima ham rakam tutar,
// bicimleme goruntuleme aninda yapilir.

const NUMBER_TEMPLATE = "**** **** **** ****";

function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

export const toNumberDigits = (value: string) => digitsOnly(value, 16);
export const toCvvDigits = (value: string) => digitsOnly(value, 3);

/**
 * Tek haneli ayi iki haneye tamamlar. Aksi halde "3/26" -> "326" olur ve
 * ay=32 gider; "1/26" daha sinsi, ay=12 yil=6 uretip sessizce yanlis tarih yollar.
 */
export function toExpiryDigits(value: string): string {
  const parts = value.split(/\D+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0].slice(0, 2).padStart(2, "0") + parts[1]).slice(0, 4);
  }

  const digits = digitsOnly(value, 4);
  return digits[0] > "1" ? `0${digits}`.slice(0, 4) : digits;
}

/** "1253543235213090" -> "1253 5432 3521 3090" */
export function groupNumber(digits: string): string {
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** Kart uzerindeki gorunum: yazilmayan haneler yildizla dolar. */
export function formatNumberOnCard(digits: string): string {
  const grouped = groupNumber(digits);
  return grouped + NUMBER_TEMPLATE.slice(grouped.length);
}

/** Input gorunumu: "0924" -> "09 / 24" */
export function formatExpiryInput(digits: string): string {
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

/** Kart uzerindeki gorunum: "09" -> "09/__" */
export function formatExpiryOnCard(digits: string): string {
  return `${digits.slice(0, 2).padEnd(2, "_")}/${digits.slice(2, 4).padEnd(2, "_")}`;
}

/**
 * Luhn saginda: sagdan sola, bir atlayarak ikiye katla, 9'u asani 9 azalt,
 * toplam 10'a bolunmeli. Yazim hatalarini bankaya gitmeden yakalar.
 */
export function passesLuhn(digits: string): boolean {
  if (digits.length < 12) return false;

  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }

  return sum % 10 === 0;
}

/** Ay 01-12 araliginda ve kartin son gunu gecmemis olmali. */
export function isExpiryValid(digits: string, now: Date): boolean {
  if (digits.length !== 4) return false;

  const month = Number(digits.slice(0, 2));
  if (month < 1 || month > 12) return false;

  // Ayin son gunu, gun sonu: new Date(y, month, 0) o ayin son gunudur.
  const lastMoment = new Date(2000 + Number(digits.slice(2, 4)), month, 0, 23, 59, 59, 999);
  return lastMoment.getTime() >= now.getTime();
}
