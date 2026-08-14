import type { NextApiRequest, NextApiResponse } from "next";
import { getOrder } from "@/lib/order";
import { getSavedCards, removeCard } from "@/lib/savedCards";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { ref, token } = req.body ?? {};
  if (typeof ref !== "string" || typeof token !== "string") {
    return res.status(400).json({ error: "ref ve token zorunlu" });
  }

  const order = getOrder(ref);
  if (!order?.customerKey) return res.status(404).json({ error: "Sipariş bulunamadı" });

  // Kart bu musteriye ait mi — istemcinin gonderdigi token'a guvenilmez.
  const owned = (await getSavedCards(order.customerKey)).some((card) => card.token === token);
  if (!owned) return res.status(404).json({ error: "Kayıtlı kart bulunamadı" });

  try {
    await removeCard(order.customerKey, token);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[card-delete]", ref, error);
    return res.status(502).json({ error: "Kart silinemedi" });
  }
}
