import type { NextApiRequest, NextApiResponse } from "next";
import { formatTrxDate, trxDateLabel } from "@/lib/format";
import { findPaymentByReferenceCode } from "@/lib/order";
import { hasSession } from "@/lib/operatorAuth";

/** Operatore, iptal etmeden once islemin bizdeki kaydini gosterir. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!hasSession(req, Date.now())) return res.status(401).json({ error: "Oturum gerekli" });

  const { referenceCode } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof referenceCode !== "string" || !referenceCode.trim()) {
    return res.status(400).json({ error: "Referans zorunlu" });
  }

  const found = findPaymentByReferenceCode(referenceCode.trim());
  if (!found) return res.status(200).json({ found: false });

  const completedAt = new Date(found.record.completedAt);

  return res.status(200).json({
    found: true,
    orderRef: found.orderRef,
    amount: found.record.chargedAmount,
    status: found.record.status,
    reversal: found.record.reversal ?? null,
    installmentCount: found.record.installmentCount,
    authCode: found.record.authCode,
    // Iade bu tarihle yapilir; ekranda gosterilen deger istekte gidenle aynidir.
    trxDateLabel: trxDateLabel(completedAt),
    /** Iade ertesi gune kadar reddedilir; ekran bunu onceden uyarabilsin. */
    sameDay: formatTrxDate(completedAt) === formatTrxDate(new Date()),
  });
}
