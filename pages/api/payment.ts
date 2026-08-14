import type { NextApiRequest, NextApiResponse } from "next";
import { isExpiryValid, passesLuhn } from "@/lib/card";
import { createRnd } from "@/lib/hash";
import { getSelectInstallments } from "@/lib/mockInstallments";
import {
  getOrder,
  getPaymentResult,
  registerAttempt,
  savePaymentResult,
} from "@/lib/order";
import { remainingSeconds } from "@/lib/format";
import { chargeCard, fetchInstallments, isLiveMode } from "@/lib/paynkolay";
import { getSavedCards } from "@/lib/savedCards";
import type { CardInput, PaymentRecord } from "@/types/payment";

// Banka onaylamadan da RESPONSE_CODE 2 donebiliyor; onay kodu bos, "0" veya "00"
// ise ortada gecerli bir tahsilat yoktur.
const INVALID_AUTH_CODES = new Set(["", "0", "00"]);

function readCard(value: unknown): CardInput | null {
  if (!value || typeof value !== "object") return null;
  const { number, month, year, cvv } = value as Record<string, unknown>;

  // Desteklenen markalarin (Visa, Mastercard, Troy) tamami 16 hane ve 3 haneli CVV.
  // 15 hane / 4 haneli CVV yalnizca Amex icindir ve marka tespitinde yer almiyor.
  const shaped =
    typeof number === "string" && /^\d{16}$/.test(number) &&
    typeof month === "string" && /^\d{2}$/.test(month) &&
    typeof year === "string" && /^\d{2}$/.test(year) &&
    typeof cvv === "string" && /^\d{3}$/.test(cvv);

  if (!shaped) return null;

  // Istemci dogrulamasi atlanabilir; Luhn ve SKT sunucuda da kontrol edilir.
  if (!passesLuhn(number as string)) return null;
  if (!isExpiryValid(`${month}${year}`, new Date())) return null;

  return { number, month, year, cvv } as CardInput;
}

function record(fields: Partial<PaymentRecord> & Pick<PaymentRecord, "status">): PaymentRecord {
  return {
    installmentCount: 0,
    chargedAmount: 0,
    referenceCode: null,
    authCode: null,
    hashDataV2: null,
    message: "",
    completedAt: new Date().toISOString(),
    ...fields,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { ref, installmentCount, card, token } = req.body ?? {};
  if (typeof ref !== "string") return res.status(400).json({ error: "ref zorunlu" });

  const order = getOrder(ref);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  const existing = getPaymentResult(ref);
  if (existing?.status === "SUCCESS") {
    return res.status(409).json({ error: "Bu sipariş için ödeme zaten alındı" });
  }
  if (existing?.status === "PENDING") {
    return res.status(409).json({ error: "Bu sipariş için bir ödeme işleniyor" });
  }
  // Iptal terminal durumdur: iptal edilen siparis "odenmemis" sayilip yeniden
  // tahsil edilemez, yoksa musteri ayni siparise ikinci kez odeme yapabilir.
  if (existing?.status === "CANCELLED") {
    return res.status(409).json({ error: "Bu sipariş iptal edildi" });
  }

  if (remainingSeconds(order.expiresAt, Date.now()) === 0) {
    return res.status(410).json({ error: "Ödeme süresi doldu" });
  }

  // Kayitli kart tokeni varsa kart alanlari hic gonderilmez.
  const savedToken = typeof token === "string" && token.length > 0 ? token : null;
  const validCard = savedToken ? null : readCard(card);
  if (!savedToken && !validCard) {
    return res.status(400).json({ error: "Kart bilgileri geçersiz" });
  }

  const count = Number(installmentCount);
  if (!Number.isInteger(count) || count < 1) {
    return res.status(400).json({ error: "Geçersiz taksit sayısı" });
  }

  const attempt = registerAttempt(ref);
  if (!attempt.allowed) {
    return res.status(429).json({ error: "Çok fazla deneme yapıldı" });
  }

  // Kilit ILK await'ten once konur. Kayitli kart sahipligi de bir servis
  // sorgusudur; kilit ondan sonra konsaydi es zamanli iki istek arasinda
  // pencere kalir ve ayni siparis iki kez cekilirdi.
  savePaymentResult(ref, record({ status: "PENDING", installmentCount: count }));

  // Tahsilat denenmeden once basarisiz olan yollar kilidi birakir; aksi halde
  // siparis kalici olarak PENDING'e sikisir ve musteri tekrar deneyemez.
  const release = (message: string) =>
    savePaymentResult(ref, record({ status: "FAILED", installmentCount: count, message }));

  // Token sahipligi mod'dan bagimsiz dogrulanir: kayitli kart bu siparisin
  // musterisine ait degilse hicbir modda kabul edilmez.
  let bin = validCard?.number.slice(0, 6);
  if (savedToken) {
    const saved = (await getSavedCards(order.customerKey)).find(
      (item) => item.token === savedToken,
    );
    if (!saved) {
      release("Kayıtlı kart bulunamadı");
      return res.status(400).json({ error: "Kayıtlı kart bulunamadı" });
    }
    bin = saved.bin;
  }

  if (!isLiveMode()) {
    const option = getSelectInstallments(order.amount).find((item) => item.count === count);
    if (!option) {
      release("Geçersiz taksit sayısı");
      return res.status(400).json({ error: "Geçersiz taksit sayısı" });
    }

    savePaymentResult(
      ref,
      record({
        status: "SUCCESS",
        installmentCount: option.count,
        chargedAmount: option.total,
        referenceCode: "MOCK-REF",
        authCode: "000000",
        message: "Mock ödeme",
      }),
    );
    return res.status(200).json({ mock: true, status: "SUCCESS" });
  }

  // Taksit sorgusu tahsilattan onceki adim: burada bir sey ters giderse kart
  // hic cekilmemistir, kilit birakilabilir. Cekim denemesinden sonraki hatalar
  // ayri ele alinir — orada belirsizlik var.
  let options;
  try {
    // Gecerli taksit listesi karttan gelir, mock tablodan degil.
    options = (await fetchInstallments(bin as string, order.amount)).options;
  } catch (error) {
    console.error("[payment] taksit sorgusu", ref, error);
    release("Taksit seçenekleri alınamadı");
    return res.status(502).json({ error: "Ödeme servisine ulaşılamadı, tekrar deneyin" });
  }

  const chargedCount = options.find((item) => item.count === count)?.count;
  if (!chargedCount) {
    release("Geçersiz taksit sayısı");
    return res.status(400).json({ error: "Bu kart için geçersiz taksit sayısı" });
  }

  try {
    const result = await chargeCard({
      clientRefCode: order.ref,
      amount: order.amount,
      rnd: createRnd(new Date()),
      installmentCount: chargedCount,
      card: validCard ?? undefined,
      token: savedToken ?? undefined,
      customerKey: order.customerKey,
    });

    // "Basarili" yaniti iki kosula daha baglidir: imza tutmali (yanit gercekten
    // Paynkolay'dan gelmis olmali) ve banka onay kodu dolu olmali — onay kodsuz
    // bir basarinin karsiligi yoktur.
    const problem = !result.ok
      ? null
      : !result.hashVerified
        ? "İmza doğrulanamadı"
        : INVALID_AUTH_CODES.has((result.authCode ?? "").trim())
          ? "Banka onay kodu gelmedi"
          : null;

    const trusted = result.ok && problem === null;
    if (problem) console.error("[payment]", problem, ref, result.referenceCode);

    savePaymentResult(
      ref,
      record({
        status: trusted ? "SUCCESS" : "FAILED",
        installmentCount: chargedCount,
        chargedAmount: result.authorizationAmount ?? order.amount,
        referenceCode: result.referenceCode,
        authCode: result.authCode,
        hashDataV2: result.hashDataV2,
        message: problem ?? (result.bankMessage ?? result.responseData),
      }),
    );

    return res.status(200).json({ mock: false, status: trusted ? "SUCCESS" : "FAILED" });
  } catch (error) {
    // Kayit PENDING kalir: tahsilat isteği gitti, gerceklesip gerceklesmedigi
    // belirsiz. Kor bir tekrar denemeye izin vermek cift cekim riski yaratir.
    console.error("[payment]", ref, error);
    return res.status(502).json({ error: "Ödeme servisine ulaşılamadı, sonucu kontrol edin" });
  }
}
