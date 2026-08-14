import type { SavedCard } from "@/types/payment";

// Faz 9a mock verisi. Sema gercek servisin dondurdugu alanlara gore kuruldu.
const SEED: Record<string, SavedCard[]> = {
  "CUST-TEST-001": [
    {
      token: "TKN-8f2a41",
      bin: "435509",
      maskedNumber: "4355 09** **** 7068",
      bankName: "Akbank",
      expiry: "11/40",
    },
    {
      token: "TKN-3c9e07",
      bin: "554960",
      maskedNumber: "5549 60** **** 2011",
      bankName: "Garanti BBVA",
      expiry: "09/28",
    },
    {
      token: "TKN-b15d62",
      bin: "540062",
      maskedNumber: "5400 62** **** 4970",
      bankName: "Yapı Kredi",
      expiry: "03/29",
    },
  ],
};

// Sayfa ve API route bundle'lari modulun ayri kopyalarini aliyor; silme islemi
// globalThis'te tutulmazsa bir tarafta silinip digerinde duruyor.
const globalStore = globalThis as typeof globalThis & {
  __paynkolayMockCards?: Record<string, SavedCard[]>;
};

const store = (globalStore.__paynkolayMockCards ??= structuredClone(SEED));

export function listSavedCards(customerKey: string | undefined): SavedCard[] {
  if (!customerKey) return [];
  return store[customerKey] ?? [];
}

export function removeSavedCard(customerKey: string, token: string): void {
  const cards = store[customerKey];
  if (!cards) return;
  store[customerKey] = cards.filter((card) => card.token !== token);
}
