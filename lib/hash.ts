import { createHash } from "node:crypto";
import { MERCHANT_TIMEZONE } from "@/lib/format";
import type { ReversalType } from "@/types/payment";

const DEFAULT_BASE_URL = "http://localhost:3000";

export type HashInput = {
  clientRefCode: string;
  amount: number;
  rnd: string;
  returnUrl: string;
};

/** Sartname: Number(amount).toFixed(2) → "240.90" (nokta, 2 ondalik). */
export function formatHashAmount(amount: number): string {
  return amount.toFixed(2);
}

const RND_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: MERCHANT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * Sartname: "DD-MM-YYYY HH" — dakika/saniye yok, cunku ayni rnd hem hash'te hem
 * odeme isteginde kullanilir. Saat daima Turkiye saatine gore uretilir; sunucunun
 * yerel saatine birakilirsa UTC ortamda 3 saat kayar ve hash tutmaz.
 */
export function createRnd(now: Date): string {
  const parts = RND_FORMAT.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}`;
}

/** Basari ve hata donusu ayni sayfaya gider; hangisi oldugu RESPONSE_CODE'dan okunur. */
export function resultUrlFor(ref: string): string {
  const base = process.env.APP_BASE_URL ?? DEFAULT_BASE_URL;
  return `${base}/sonuc?ref=${encodeURIComponent(ref)}`;
}

/**
 * Duz birlestirme, ayrac yok: clientRefCode + amount + successURL + failURL + RND
 * returnUrl disaridan verilir; hash ile istegin ayni adresi kullanmasi boyle garanti edilir.
 */
export function buildStrHash({ clientRefCode, amount, rnd, returnUrl }: HashInput): string {
  return clientRefCode + formatHashAmount(amount) + returnUrl + returnUrl + rnd;
}

/**
 * Donus imzasi. Giden hash'ten farkli: ayrac `|` ve SHA-512 bizde hesaplaniyor
 * (secret .env'de). Alan sirasi dokumandaki "Hash Yanıtı" bolumunden, olculerek dogrulandi.
 *
 * Degerler HAM kullanilir: AUTHORIZATION_AMOUNT sayiya cevrilmez ("244.07" -> 244.07
 * olursa hash bozulur), RND donen deger olmalidir (bizim gonderdigimiz degil),
 * CURRENCY_CODE donuste "TRY" gelir — istege gonderdigimiz 949 degil.
 */
const RESPONSE_HASH_FIELDS = [
  "MERCHANT_NO",
  "REFERENCE_CODE",
  "AUTH_CODE",
  "RESPONSE_CODE",
  "USE_3D",
  "RND",
  "INSTALLMENT",
  "AUTHORIZATION_AMOUNT",
  "CURRENCY_CODE",
] as const;

export function buildResponseHash(response: Record<string, unknown>): string {
  const parts = RESPONSE_HASH_FIELDS.map((field) => {
    const value = response[field];
    return value === null || value === undefined ? "" : String(value);
  });

  parts.push(process.env.PAYNKOLAY_MERCHANT_SECRET_KEY ?? "");
  return createHash("sha512").update(parts.join("|"), "utf8").digest("base64");
}

type CancelHashInput = {
  sx: string;
  referenceCode: string;
  type: ReversalType;
  amount: number;
  trxDate: string;
};

/**
 * Iptal imzasi — odeme hash'inden farkli:
 *   · ayrac `|` (odeme hash'i ayracsizdi)
 *   · SHA-512 burada hesaplanir (odeme hash'i HashUrl servisinden alinir)
 *   · sx ayridir: odeme sx'inin ucuncu bir parca eklenmis hali (iptal yetkisi)
 *
 * Secret AYNI merchant secret'idir — iptale ozel bir secret yoktur, olculerek dogrulandi.
 * Servis alan adi olarak `hashDatav2` bekler; `hashData` ayri ve eski bir yol.
 *
 * `type` hash'e de girer: istekteki tip ile imzadaki tip ayrisirsa "hashDatav2 error".
 */
export function buildCancelHash({
  sx,
  referenceCode,
  type,
  amount,
  trxDate,
}: CancelHashInput): string {
  const parts = [
    sx,
    referenceCode,
    type,
    formatHashAmount(amount),
    trxDate,
    process.env.PAYNKOLAY_MERCHANT_SECRET_KEY ?? "",
  ];

  return createHash("sha512").update(parts.join("|"), "utf8").digest("base64");
}
