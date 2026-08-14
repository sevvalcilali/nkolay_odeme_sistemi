// Tarayiciya da inen saf yardimcilar. Sunucu durumu (siparis deposu, node:crypto)
// lib/order.ts'te kalir: ikisi ayni dosyada olsaydi sayfa paketi node:crypto'yu
// bundle etmeye calisir ve produksiyon derlemesi kirilirdi.

/** 240.9 -> "240,90" — Intl kullanmiyoruz, hydration farki olusmasin. */
export function formatAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

export function remainingSeconds(expiresAt: string, now: number): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatRemaining(seconds: number): string {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Gun sinirini sunucunun yerel saati degil, isyerinin saati belirler. */
export const MERCHANT_TIMEZONE = "Europe/Istanbul";

const TRX_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: MERCHANT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Iptal/iade servisinin bekledigi bicim: yyyy.aa.gg — "2026.08.13" */
export function formatTrxDate(date: Date): string {
  return TRX_DATE_FORMAT.format(date).replace(/-/g, ".");
}

/** Ekranda okunur bicim: "13.08.2026". Servise bu bicim GITMEZ. */
export function trxDateLabel(date: Date): string {
  return formatTrxDate(date).split(".").reverse().join(".");
}
