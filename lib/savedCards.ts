import { listSavedCards, removeSavedCard } from "@/lib/mockCards";
import { deleteSavedCard, fetchSavedCards, isLiveMode } from "@/lib/paynkolay";
import type { SavedCard } from "@/types/payment";

/**
 * Kayitli kart kaynagi. Kapi mantigi (odeme.tsx) ve secim ekrani (kayitli-kart.tsx)
 * ayni yerden okur; mock/gercek ayrimi tek noktada.
 *
 * Servise ulasilamazsa liste bos kabul edilir — kullanici kart giris formuna duser.
 * Kapinin acilmamasi, odemenin hic yapilamamasindan iyidir.
 */
export async function removeCard(customerKey: string, token: string): Promise<void> {
  if (!isLiveMode()) return removeSavedCard(customerKey, token);
  return deleteSavedCard(customerKey, token);
}

export async function getSavedCards(customerKey: string | undefined): Promise<SavedCard[]> {
  if (!customerKey) return [];
  if (!isLiveMode()) return listSavedCards(customerKey);

  try {
    return await fetchSavedCards(customerKey);
  } catch (error) {
    console.error("[savedCards]", customerKey, error);
    return [];
  }
}
