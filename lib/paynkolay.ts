import {
  buildCancelHash,
  buildResponseHash,
  buildStrHash,
  formatHashAmount,
  resultUrlFor,
  type HashInput,
} from "@/lib/hash";
import { formatTrxDate } from "@/lib/format";
import type { CardInput, InstallmentOption, ReversalType, SavedCard } from "@/types/payment";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Banka tarafi yavaslarsa istek sonsuza kadar asili kalmasin.
const QUERY_TIMEOUT_MS = 10_000;
const PAYMENT_TIMEOUT_MS = 30_000;

async function postForm(url: string, form: FormData, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new Error(`Paynkolay yanıt vermedi (${timeoutMs / 1000} sn)`);
    }
    throw error;
  }
}

/** Bakim sayfasi veya WAF blogu HTML doner; response.json() ham SyntaxError firlatir. */
async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${label} ${response.status}: ${body.slice(0, 200)}`);
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} beklenmeyen yanıt: ${body.slice(0, 200)}`);
  }
}

/** Servis RESPONSE_CODE'u bazen sayi bazen metin dondurebiliyor. */
function isSuccessCode(value: unknown): boolean {
  return String(value) === SUCCESS_CODE;
}

const SUCCESS_CODE = "2";

/** Servis tutari "244.07" veya "244,07" bicimlerinde donebiliyor. */
export function parseServiceAmount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

type PaymentResult = {
  ok: boolean;
  /** Donen imza kendi hesabimizla tutuyor mu. Basarisiz islemlerde imza gelmez. */
  hashVerified: boolean;
  responseData: string;
  referenceCode: string | null;
  authCode: string | null;
  authorizationAmount: number | null;
  bankMessage: string | null;
  hashDataV2: string | null;
};

export function isLiveMode(): boolean {
  return process.env.PAYNKOLAY_LIVE === "true";
}

function requireUrl(name: string): string {
  const url = process.env[name];
  if (!url) throw new Error(`${name} tanımlı değil`);
  return url;
}

/**
 * Hash'i biz hesaplamiyoruz: strHash'i HashData servisine POST edip donen duz
 * metni kullaniyoruz. Secret servisin kendi tarafinda, bize hic inmiyor.
 */
async function fetchPaymentHash(input: HashInput, customerKey: string): Promise<string> {
  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("strHash", buildStrHash(input));
  form.append("customerKey", customerKey);

  const response = await postForm(requireUrl("PAYNKOLAY_HASH_URL"), form, QUERY_TIMEOUT_MS);
  const body = (await response.text()).trim();

  if (!response.ok) throw new Error(`HashData ${response.status}: ${body.slice(0, 200)}`);

  // Servis hatada da 200 doner; govde JSON ise hash degil hata demektir.
  const serviceError = readServiceError(body);
  if (serviceError) throw new Error(`HashData: ${serviceError}`);

  if (!BASE64.test(body)) {
    throw new Error(`HashData beklenmeyen yanıt: ${body.slice(0, 200)}`);
  }

  return body;
}

function readServiceError(body: string): string | null {
  if (!body.startsWith("{")) return null;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return String((parsed as { error: unknown }).error);
    }
    return "bilinmeyen servis hatası";
  } catch {
    return null;
  }
}

type BankRow = {
  INSTALLMENT: number;
  INSTALLMENT_AMOUNT: number;
  AUTHORIZATION_AMOUNT: number;
  /** Turkiye EFT banka kodu. Yalnizca CARD_SCOPE="D" kartlarda dolu gelir. */
  CARD_BANK_NO: string | null;
};

const BANK_NAMES: Record<string, string> = {
  "010": "Ziraat Bankası",
  "012": "Halkbank",
  "015": "Vakıfbank",
  "032": "TEB",
  "046": "Akbank",
  "059": "Şekerbank",
  "062": "Garanti BBVA",
  "064": "Türkiye İş Bankası",
  "067": "Yapı Kredi",
  "092": "Citibank",
  "099": "ING",
  "103": "Fibabanka",
  "111": "QNB Finansbank",
  "123": "HSBC",
  "124": "Alternatif Bank",
  "125": "Burgan Bank",
  "134": "Denizbank",
  "135": "Anadolubank",
  "143": "Aktif Bank",
  "146": "Odeabank",
  "203": "Albaraka Türk",
  "205": "Kuveyt Türk",
  "206": "Türkiye Finans",
};

function bankNameOf(code: string | null | undefined): string | null {
  if (!code) return null;
  return BANK_NAMES[code.padStart(3, "0")] ?? null;
}

/** BIN yeterli — tam kart numarasi gonderilmiyor. */
export async function fetchInstallments(
  bin: string,
  amount: number,
): Promise<{ bank: string | null; options: InstallmentOption[] }> {
  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("cardNumber", bin);
  form.append("amount", formatHashAmount(amount));

  const response = await postForm(requireUrl("PAYNKOLAY_INSTALLMENTS_URL"), form, QUERY_TIMEOUT_MS);
  const data = await readJson(response, "PaymentInstallments");

  if (!isSuccessCode(data.RESPONSE_CODE)) {
    throw new Error(String(data.RESPONSE_DATA ?? "Taksit sorgusu başarısız"));
  }

  const rows = (data.PAYMENT_BANK_LIST ?? []) as BankRow[];
  return {
    bank: bankNameOf(rows[0]?.CARD_BANK_NO),
    options: rows.map((row) => ({
      count: row.INSTALLMENT,
      monthly: row.INSTALLMENT_AMOUNT,
      total: row.AUTHORIZATION_AMOUNT,
    })),
  };
}

/**
 * Kart saklama hash'i. Liste icin strHash = customerKey, silme icin
 * strHash = customerKey + token. Ikisi de olculerek dogrulandi.
 */
async function fetchCardStorageHash(strHash: string): Promise<string> {
  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("strHash", strHash);
  form.append("customerKey", "");

  const response = await postForm(requireUrl("PAYNKOLAY_HASH_URL"), form, QUERY_TIMEOUT_MS);
  const body = (await response.text()).trim();

  if (!BASE64.test(body)) {
    throw new Error(`CardStorage hash beklenmeyen yanıt: ${body.slice(0, 200)}`);
  }

  return body;
}

type StoredCardRow = {
  CardToken?: string;
  CardNumber?: string;
  BankName?: string;
  ExpiryDate?: string;
};

// Servisin dondugu ic ice yol. "CardFileds" yazimi servise ait, duzeltilmez.
type CardStorageData = {
  cards?: { Card?: { CardFileds?: { Detail?: unknown } } };
} | null;

/** Servis tek kartta OBJE, cok kartta ARRAY doner — normalize sart. */
function toRows(value: unknown): StoredCardRow[] {
  if (!value) return [];
  return Array.isArray(value) ? (value as StoredCardRow[]) : [value as StoredCardRow];
}

/**
 * Kayitli kart listesi. Kart numarasi bizde saklanmaz; servis maskeli gorunum
 * ve token doner. Kart yoksa ProcReturnCode "02" + "Gecerli Kart Yok" gelir.
 */
export async function fetchSavedCards(customerKey: string): Promise<SavedCard[]> {
  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("customerKey", customerKey);
  form.append("hashData", await fetchCardStorageHash(customerKey));

  const response = await postForm(requireUrl("PAYNKOLAY_CARDSTORAGE_URL"), form, QUERY_TIMEOUT_MS);
  const data = await readJson(response, "CardStorage");

  const detail = (data.Data as CardStorageData)?.cards?.Card?.CardFileds?.Detail;

  return toRows(detail).map((row) => {
    const masked = String(row.CardNumber ?? "");
    return {
      token: String(row.CardToken ?? ""),
      bin: masked.replace(/\D/g, "").slice(0, 6),
      maskedNumber: masked,
      bankName: row.BankName ?? null,
      expiry: String(row.ExpiryDate ?? ""),
    };
  });
}

/** Kayitli kart siler. Servis alan adi olarak `token` veya `tranId` kabul ediyor. */
export async function deleteSavedCard(customerKey: string, token: string): Promise<void> {
  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("customerKey", customerKey);
  form.append("token", token);
  form.append("hashData", await fetchCardStorageHash(customerKey + token));

  const response = await postForm(requireUrl("PAYNKOLAY_CARDDELETE_URL"), form, QUERY_TIMEOUT_MS);
  const data = await readJson(response, "CardStorageCardDelete");

  if (!isSuccessCode(data.RESPONSE_CODE)) {
    throw new Error(String(data.RESPONSE_DATA ?? "Kart silinemedi"));
  }
}

type ChargeRequest = {
  clientRefCode: string;
  amount: number;
  rnd: string;
  installmentCount: number;
  /** Yeni kart girisi. Kayitli kartta yerine token gonderilir. */
  card?: CardInput;
  /** Kayitli kart tokeni. Gonderildiginde servis kart alanlarini hic dogrulamaz. */
  token?: string;
  /** Kayitli kart kullaniminda musteri anahtari. Gonderilirse hash'e de girer. */
  customerKey?: string;
};

/**
 * Hash alma ve odeme gonderme tek adimda: ikisi ayri cagrilsaydi ayni degerlerin
 * (ref, tutar, rnd, donus adresi) iki kez gecirilmesi gerekirdi ve ayrisabilirlerdi.
 * non-3D oldugu icin istek senkron sonuclanir, yonlendirme yok.
 */
export async function chargeCard(request: ChargeRequest): Promise<PaymentResult> {
  const returnUrl = resultUrlFor(request.clientRefCode);

  // csCustomerKey forma girerse ayni deger HashData'ya da girmeli; ayrisirlarsa
  // servis "Hash Data Uyuşmazlığı" doner. Ikisi birlikte hareket etsin diye tek yerde.
  const customerKey = request.token ? (request.customerKey ?? "") : "";

  const hash = await fetchPaymentHash(
    {
      clientRefCode: request.clientRefCode,
      amount: request.amount,
      rnd: request.rnd,
      returnUrl,
    },
    customerKey,
  );

  const form = new FormData();
  form.append("sx", process.env.PAYNKOLAY_SX ?? "");
  form.append("hashData", hash);
  form.append("clientRefCode", request.clientRefCode);
  form.append("amount", formatHashAmount(request.amount));
  form.append("rnd", request.rnd);
  form.append("successUrl", returnUrl);
  form.append("failUrl", returnUrl);
  form.append("installmentNo", String(request.installmentCount));

  if (customerKey) form.append("csCustomerKey", customerKey);

  if (request.token) {
    form.append("csToken", request.token);
  } else if (request.card) {
    form.append("cardNumber", request.card.number);
    form.append("month", request.card.month);
    form.append("year", request.card.year);
    form.append("cvv", request.card.cvv);
  }

  const response = await postForm(requireUrl("PAYNKOLAY_PAYMENT_URL"), form, PAYMENT_TIMEOUT_MS);
  const data = await readJson(response, "Payment");

  const asText = (value: unknown) => (typeof value === "string" && value ? value : null);
  const returnedHash = asText(data.hashDatav2);

  return {
    ok: isSuccessCode(data.RESPONSE_CODE),
    hashVerified: returnedHash !== null && returnedHash === buildResponseHash(data),
    responseData: String(data.RESPONSE_DATA ?? ""),
    referenceCode: asText(data.REFERENCE_CODE),
    authCode: asText(data.AUTH_CODE),
    authorizationAmount: parseServiceAmount(data.AUTHORIZATION_AMOUNT),
    bankMessage: asText(data.BANK_MESSAGE),
    hashDataV2: asText(data.hashDatav2),
  };
}

type ReversalResult = {
  ok: boolean;
  responseData: string;
  /** Iadede banka onay kodu doner; iptalde null gelir (olculdu). */
  authCode: string | null;
};

type ReversalRequest = {
  referenceCode: string;
  /** `cancel` ayni gun blokeyi kaldirir, `refund` sonraki gunlerde parayi geri gonderir. */
  type: ReversalType;
  amount: number;
  /**
   * ISLEMIN KENDI tarihi — bugunun tarihi degil. Iptalde ikisi ayni oldugu icin
   * fark gorunmez; iadede bugun verilirse servis kurala takar, yanlis gun
   * verilirse NullPointerException doner (olculdu).
   */
  trxDate: Date;
};

/**
 * Odeme geri alma. Odemeden iki farki var: kendi `sx`'ini kullanir
 * (PAYNKOLAY_CANCEL_SX, uc parcali) ve imzasi lokal hesaplanir — `hashDatav2`
 * alaniyla gonderilir. Iade icin ayri yetki yok, ayni sx iki tipi de kapsiyor.
 */
export async function cancelPayment({
  referenceCode,
  type,
  amount,
  trxDate,
}: ReversalRequest): Promise<ReversalResult> {
  const sx = process.env.PAYNKOLAY_CANCEL_SX;
  if (!sx) throw new Error("PAYNKOLAY_CANCEL_SX tanımlı değil");

  const day = formatTrxDate(trxDate);

  const form = new FormData();
  form.append("sx", sx);
  form.append("referenceCode", referenceCode);
  form.append("type", type);
  form.append("amount", formatHashAmount(amount));
  form.append("trxDate", day);
  form.append("hashDatav2", buildCancelHash({ sx, referenceCode, type, amount, trxDate: day }));

  const response = await postForm(requireUrl("PAYNKOLAY_CANCEL_URL"), form, PAYMENT_TIMEOUT_MS);
  const data = await readJson(response, "CancelRefundPayment");

  return {
    ok: isSuccessCode(data.RESPONSE_CODE),
    responseData: String(data.RESPONSE_DATA ?? ""),
    authCode: typeof data.AUTH_CODE === "string" && data.AUTH_CODE ? data.AUTH_CODE : null,
  };
}

const AMBIGUOUS_NOT_FOUND = "Bu kayıt daha önce iptal edilmiştir";

/**
 * Iadede "bulunamadi" bir mesajla degil, sunucu coku sokerek geliyor: uydurma
 * referans da, yanlis trxDate de ayni Java izini donduruyor (olculdu). Ham hali
 * ekrana dusmemeli — hem okunmaz hem de servisin ic yapisini sizdirir.
 */
const NOT_FOUND_CRASH = "NullPointerException";

/**
 * Servis, hic var olmayan bir referans icin de "daha once iptal edilmistir" doner
 * (olculdu: uydurma referans ayni mesaji aldi). Mesaji oldugu gibi gostermek
 * operatore "islem zaten iptalli" dedirtir — oysa referans yanlis yazilmis olabilir.
 */
export function describeReversalFailure(type: ReversalType, responseData: string): string {
  if (responseData.startsWith(AMBIGUOUS_NOT_FOUND)) {
    return "İşlem bulunamadı veya daha önce iptal edilmiş";
  }

  if (responseData.includes(NOT_FOUND_CRASH)) {
    return "İşlem bulunamadı — referans veya işlem tarihi eşleşmiyor";
  }

  if (responseData) return responseData;
  return type === "refund" ? "İade işlemi tamamlanamadı" : "İptal işlemi tamamlanamadı";
}
