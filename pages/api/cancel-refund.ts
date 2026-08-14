import type { NextApiRequest, NextApiResponse } from "next";
import { findPaymentByReferenceCode, markPaymentReversed } from "@/lib/order";
import { hasSession } from "@/lib/operatorAuth";
import { cancelPayment, describeReversalFailure, parseServiceAmount } from "@/lib/paynkolay";
import type { ReversalType } from "@/types/payment";

const AMOUNT_TOLERANCE = 0.005;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!hasSession(req, Date.now())) return res.status(401).json({ error: "Oturum gerekli" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const referenceCode =
    typeof body.referenceCode === "string" ? body.referenceCode.trim() : "";
  if (!referenceCode) return res.status(400).json({ error: "Referans zorunlu" });

  const type: ReversalType | null =
    body.type === "cancel" || body.type === "refund" ? body.type : null;
  if (!type) return res.status(400).json({ error: "İşlem tipi geçersiz" });

  const amount = parseServiceAmount(body.amount);
  if (amount === null || amount <= 0) return res.status(400).json({ error: "Tutar geçersiz" });

  // Tutar dogrulamasi BIZDE: servis 244.07'lik islemi 99.99 ile iptal ediyor (olculdu).
  const found = findPaymentByReferenceCode(referenceCode);

  if (found) {
    if (found.record.status === "CANCELLED") {
      return res.status(409).json({
        error:
          found.record.reversal === "refund"
            ? "Bu işlem daha önce iade edilmiş"
            : "Bu işlem daha önce iptal edilmiş",
      });
    }
    if (found.record.status !== "SUCCESS") {
      return res.status(409).json({ error: "Bu referans başarılı bir ödemeye ait değil" });
    }
    if (Math.abs(found.record.chargedAmount - amount) >= AMOUNT_TOLERANCE) {
      return res.status(400).json({ error: "Tutar kayıttaki tahsilat tutarıyla uyuşmuyor" });
    }
  } else if (type === "refund") {
    // Iade tarihi islemin kendi tarihidir ve tek kaynagi kayittir. Tahmin
    // edilemez: yanlis gun gonderilirse servis NullPointerException doner.
    return res.status(400).json({ error: "İade için işlemin kaydı gerekli, tarih doğrulanamıyor" });
  } else if (body.confirmUnverified !== true) {
    // Kaydi olmayan islem gercek olabilir (baska oturumda alinmis) ama tutari
    // dogrulayamayiz. Yanlislikla iptal edilmesin diye acik onay istenir.
    return res.status(400).json({
      error: "Bu referans kayıtlarımızda yok, tutar doğrulanamıyor",
      needsConfirm: true,
    });
  }

  // Kayitli islemde daima tahsilat ani; kayitsiz iptalde islem zaten bugundur.
  const trxDate = found ? new Date(found.record.completedAt) : new Date();

  try {
    const result = await cancelPayment({ referenceCode, type, amount, trxDate });

    if (!result.ok) {
      return res
        .status(200)
        .json({ ok: false, type, message: describeReversalFailure(type, result.responseData) });
    }

    if (found) markPaymentReversed(found.orderRef, new Date().toISOString(), type);

    return res.status(200).json({
      ok: true,
      type,
      message: result.responseData,
      // Iadenin dekontu: banka onay kodu yalnizca iade yanitinda dolu gelir.
      authCode: result.authCode,
      verified: Boolean(found),
    });
  } catch (error) {
    console.error("[cancel-refund]", type, referenceCode, error);
    return res.status(502).json({ error: "Servise ulaşılamadı, tekrar deneyin" });
  }
}
