import { MastercardMark, TroyMark, VisaMark } from "@/components/BrandLogos";
import { detectBrand, type CardBrand } from "@/lib/bin";
import InstallmentSelect from "@/components/InstallmentSelect";
import { formatAmount } from "@/lib/format";
import type { InstallmentOption, SavedCard } from "@/types/payment";

type Props = {
  cards: SavedCard[];
  selectedToken: string;
  onSelect: (token: string) => void;
  amount: number;
  installments: InstallmentOption[];
  selectedInstallment: number;
  onSelectInstallment: (count: number) => void;
  newCardHref: string;
  onDelete: (token: string) => void;
  deletingToken: string | null;
  onSubmit: () => void;
  submitting: boolean;
  locked: boolean;
  error: string | null;
};

export default function SavedCards({
  cards,
  selectedToken,
  onSelect,
  amount,
  installments,
  selectedInstallment,
  onSelectInstallment,
  newCardHref,
  onDelete,
  deletingToken,
  onSubmit,
  submitting,
  locked,
  error,
}: Props) {
  const selectedBank = cards.find((card) => card.token === selectedToken)?.bankName ?? null;

  return (
    <div className="flex flex-col">
      <h1 className="text-xl font-semibold text-ink">Kayıtlı Kart Seçin</h1>
      <p className="mt-1 text-xs text-muted">
        Kart bilgileriniz Paynkolay tarafında saklanır, bizde yalnızca maskeli görünüm tutulur.
      </p>

      <div className="mt-6 divide-y divide-line rounded-lg border border-line">
        {cards.map((card) => (
          <div key={card.token} className="flex items-center gap-3 px-4 py-3.5 hover:bg-canvas">
            <button
              type="button"
              onClick={() => onSelect(card.token)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Radio checked={card.token === selectedToken} />
              <BrandMark brand={detectBrand(card.bin)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">
                  {card.bankName ?? "Kayıtlı kart"}
                </span>
                <span className="block text-xs tabular-nums text-muted">
                  {card.maskedNumber} · {card.expiry}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.token)}
              disabled={deletingToken !== null}
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-danger hover:text-danger disabled:opacity-50"
            >
              {deletingToken === card.token ? "Siliniyor…" : "Sil"}
            </button>
          </div>
        ))}
      </div>

      {installments.length > 0 && (
        <div className="mt-4">
          <InstallmentSelect
            bank={selectedBank}
            options={installments}
            selected={selectedInstallment}
            onSelect={onSelectInstallment}
            disabled={locked}
          />
        </div>
      )}

      <hr className="mt-6 border-line" />

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || locked}
        className={`mt-6 w-full rounded-lg py-3.5 text-[15px] font-medium text-white transition-colors ${
          submitting || locked ? "bg-brand-soft" : "bg-brand"
        }`}
      >
        {submitting ? "Ödeme alınıyor…" : `${formatAmount(amount)} TL Ödeme Yap`}
      </button>

      <a
        href={newCardHref}
        className="mt-4 text-center text-sm font-medium text-brand underline"
      >
        Yeni kartla öde
      </a>
    </div>
  );
}

// Taninmayan BIN'de notr bir kart silueti durur; Visa varsayilmasi kullaniciya
// sahip olmadigi bir markayi gosterirdi.
function BrandMark({ brand }: { brand: CardBrand | null }) {
  if (brand === "mastercard") return <MastercardMark className="h-6 w-auto shrink-0" />;
  if (brand === "troy") return <TroyMark className="shrink-0 text-base text-ink" />;
  if (brand === "visa") return <VisaMark className="shrink-0 text-lg text-[#1a1f71]" />;
  return <span className="h-5 w-8 shrink-0 rounded border border-line" />;
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
        checked ? "border-brand text-brand" : "border-line"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor">
          <path d="M2 6.2 4.6 8.8 10 3.4" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
