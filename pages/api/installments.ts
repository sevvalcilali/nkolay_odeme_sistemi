import type { NextApiRequest, NextApiResponse } from "next";
import { getSelectInstallments, MOCK_BANK } from "@/lib/mockInstallments";
import { getOrder } from "@/lib/order";
import { fetchInstallments, isLiveMode } from "@/lib/paynkolay";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { ref, bin } = req.body ?? {};
  if (typeof ref !== "string") return res.status(400).json({ error: "ref zorunlu" });
  if (typeof bin !== "string" || !/^\d{6,8}$/.test(bin)) {
    return res.status(400).json({ error: "bin 6-8 hane olmalı" });
  }

  const order = getOrder(ref);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  if (!isLiveMode()) {
    return res.status(200).json({
      mock: true,
      bank: MOCK_BANK,
      installments: getSelectInstallments(order.amount),
    });
  }

  try {
    const { bank, options } = await fetchInstallments(bin, order.amount);
    return res.status(200).json({ mock: false, bank, installments: options });
  } catch (error) {
    return res.status(502).json({ error: (error as Error).message });
  }
}
