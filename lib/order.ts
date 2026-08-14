import { randomUUID } from "node:crypto";
import type { Order, PaymentRecord, ReversalType } from "@/types/payment";

// Mock siparis kaynagi. Gercek sistemde bu bir DB/servis sorgusu olur ve
// expiresAt siparis olusturulurken kaydedilir.

const DEFAULT_WINDOW_MINUTES = 3;

const DEMO_ORDER_REF = "ORD-2024-1234";
/** Anonim akisi test etmek icin: customerKey tasimaz, kayitli kart kapisi acilmaz. */
const ANONYMOUS_ORDER_REF = "ORD-2024-9999";

const MAX_PAYMENT_ATTEMPTS = 3;

type OrderStore = {
  orders: Record<string, Omit<Order, "expiresAt">>;
  expiry: Map<string, string>;
  payments: Map<string, PaymentRecord>;
  attempts: Map<string, number>;
};

// Sayfa bundle'i ile API route bundle'i modulun ayri kopyalarini aliyor.
// Ortak durum globalThis uzerinde tutulmazsa calisma aninda uretilen siparisler
// ve expiresAt damgalari iki taraf arasinda uyusmuyor. Faz 6'da gercek kaynaga
// baglanirken bu tamamen kalkacak.
const globalStore = globalThis as typeof globalThis & { __paynkolayOrders?: OrderStore };

const store: OrderStore = (globalStore.__paynkolayOrders ??= {
  orders: {
    [DEMO_ORDER_REF]: {
      ref: DEMO_ORDER_REF,
      merchantName: "HAYALEVİ LTD. ŞTİ.",
      customerName: "Zafer",
      amount: 240.9,
      currency: "TRY",
      customerKey: "CUST-TEST-001",
    },
    [ANONYMOUS_ORDER_REF]: {
      ref: ANONYMOUS_ORDER_REF,
      merchantName: "HAYALEVİ LTD. ŞTİ.",
      customerName: "Misafir",
      amount: 240.9,
      currency: "TRY",
    },
  },
  expiry: new Map(),
  payments: new Map(),
  attempts: new Map(),
});

function windowMs(): number {
  const raw = Number(process.env.PAYMENT_WINDOW_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MINUTES;
  return minutes * 60 * 1000;
}

// Damga siparis basina bir kez konur — ayni ref'i yenilemek sureyi uzatmaz.
function expiryFor(ref: string): string {
  const existing = store.expiry.get(ref);
  if (existing) return existing;

  const stamped = new Date(Date.now() + windowMs()).toISOString();
  store.expiry.set(ref, stamped);
  return stamped;
}

export function getOrder(ref: string): Order | null {
  const record = store.orders[ref];
  if (!record) return null;

  return { ...record, expiresAt: expiryFor(ref) };
}

/**
 * ref'siz /odeme acilisi "yeni siparis" sayilir: yeni ref uretilir, pencere
 * sifirdan baslar. Uretilen ref URL'e yazildigi icin yenileme sureyi uzatmaz.
 * Produksiyonda cagrilmaz — orada ref zorunludur.
 *
 * Referans rastgele uretilir: sirali olsaydi adres cubugunda sayi artirilarak
 * baskalarinin siparis ve odeme kayitlari gezilebilirdi.
 */
export function createDevOrder(): string {
  const ref = `DEV-${randomUUID()}`;
  store.orders[ref] = { ...store.orders[DEMO_ORDER_REF], ref };
  return ref;
}

export function savePaymentResult(ref: string, record: PaymentRecord): void {
  store.payments.set(ref, record);
}

export function getPaymentResult(ref: string): PaymentRecord | null {
  return store.payments.get(ref) ?? null;
}

/**
 * Iptal veya iade basarili olduktan sonra cagrilir. Kayit SUCCESS birakilirsa
 * /sonuc geri alinmis odemeyi basarili gosterir. Tutar, referans ve tahsilat ani
 * korunur; degisen durum, mesaj ve geri alma damgasi.
 */
export function markPaymentReversed(orderRef: string, at: string, type: ReversalType): void {
  const record = store.payments.get(orderRef);
  if (!record) return;

  store.payments.set(orderRef, {
    ...record,
    status: "CANCELLED",
    message: type === "refund" ? "Ödeme iade edildi" : "Ödeme iptal edildi",
    reversal: type,
    reversedAt: at,
  });
}

/**
 * Operator ekranindan Paynkolay referansi girilir; kayitlarimiz siparis ref'iyle
 * anahtarli oldugu icin ters arama gerekir. Iptalde tutari dogrulamanin tek
 * dayanagi budur — servis tutari kontrol etmiyor.
 */
export function findPaymentByReferenceCode(
  referenceCode: string,
): { orderRef: string; record: PaymentRecord } | null {
  for (const [orderRef, record] of store.payments) {
    if (record.referenceCode === referenceCode) return { orderRef, record };
  }

  return null;
}

/**
 * Ayni siparise sinirsiz kart denenmesini engeller. Aksi halde odeme ucu,
 * calinti kart listesini SUCCESS/FAILED cevabiyla test eden bir araca doner.
 */
export function registerAttempt(ref: string): { allowed: boolean; used: number } {
  const used = (store.attempts.get(ref) ?? 0) + 1;
  store.attempts.set(ref, used);
  return { allowed: used <= MAX_PAYMENT_ATTEMPTS, used };
}

