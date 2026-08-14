export type Order = {
  ref: string;
  merchantName: string;
  customerName: string;
  /** TL cinsinden tutar. Hash'e girecek deger daima sunucudan okunur. */
  amount: number;
  currency: "TRY";
  /** Siparis olusurken konan ISO damga. Sayfa yenilemek bunu sifirlamaz. */
  expiresAt: string;
  /** Kart saklama anahtari. Anonim siparis tasimaz — o zaman kapi hic acilmaz. */
  customerKey?: string;
};

/**
 * Kart numarasi bizde saklanmaz (PCI DSS). Paynkolay'da tutulur; bizde yalnizca
 * token ve maskeli gorunum olur.
 */
export type SavedCard = {
  token: string;
  /** Ilk 6 hane — marka tespiti icin. Maskeli numaranin acik kismi. */
  bin: string;
  maskedNumber: string;
  bankName: string | null;
  expiry: string;
};

export type InstallmentOption = {
  count: number;
  /** Aylik odenecek tutar. */
  monthly: number;
  /** Bankanin tahsil edecegi toplam; komisyon dahil. */
  total: number;
};

type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

/**
 * Geri alma turu — servisin `type` alani. Ayni gun iptal, sonraki gunler iade;
 * bu ayrimi servis kendisi dayatiyor ("İade aynı gün yapılamaz").
 */
export type ReversalType = "cancel" | "refund";

export type PaymentRecord = {
  status: PaymentStatus;
  installmentCount: number;
  chargedAmount: number;
  referenceCode: string | null;
  authCode: string | null;
  /** Paynkolay'in donus imzasi. Callback dogrulamasinin karsilastirma tabani. */
  hashDataV2: string | null;
  message: string;
  completedAt: string;
  /**
   * Iptal ve iade ayni terminal duruma (CANCELLED) duser — ikisi de parayi geri
   * verir, ikisinden sonra da yeniden tahsilat yapilmaz. Ayrim burada tutulur:
   * musteriye anlatimi farklidir, bloke kaldirmak ile para iadesi ayni sey degil.
   */
  reversal?: ReversalType;
  /** Geri alma damgasi. completedAt'in uzerine yazilmaz — tahsilat ani korunur. */
  reversedAt?: string;
};

export type CardInput = {
  number: string;
  month: string;
  year: string;
  cvv: string;
};
