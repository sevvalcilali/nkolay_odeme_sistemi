import { useState } from "react";
import { INSTALLMENT_BANKS } from "@/lib/mockInstallments";
import type { InstallmentOption } from "@/types/payment";
import { formatAmount } from "@/lib/format";

type Props = {
  open: boolean;
  onClose: () => void;
  options: InstallmentOption[];
};

export default function InstallmentModal({ open, onClose, options }: Props) {
  const [bank, setBank] = useState(INSTALLMENT_BANKS[0]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Taksit Seçenekleri</h2>
            <p className="mt-1 text-xs text-muted">
              Örnek taksit tablosudur, kartınıza göre değişir.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md bg-panel p-1.5 text-brand"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor">
              <path d="m5 5 10 10M15 5 5 15" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mx-4 flex overflow-x-auto rounded-t-lg border border-line bg-canvas sm:mx-6">
          {INSTALLMENT_BANKS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setBank(name)}
              className={`flex-1 whitespace-nowrap px-3 py-3 text-xs font-semibold ${
                name === bank ? "rounded-t-lg bg-white text-ink shadow-sm" : "text-muted"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mx-4 mb-6 overflow-hidden rounded-b-lg border border-t-0 border-line sm:mx-6">
          <div className="grid grid-cols-3 border-b border-line text-xs font-medium text-ink">
            <span className="px-4 py-3 text-center">Taksit</span>
            <span className="border-x border-line px-4 py-3 text-center">Taksit Tutarı</span>
            <span className="px-4 py-3 text-center">Toplam Tutar</span>
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {options.map((option) => (
              <div
                key={option.count}
                className="grid grid-cols-3 border-b border-line text-sm last:border-b-0"
              >
                <span className="px-4 py-3 text-center text-ink">{option.count}</span>
                <span className="border-x border-line px-4 py-3 text-center text-ink">
                  {formatAmount(option.monthly)} TL
                </span>
                <span className="px-4 py-3 text-center text-muted">
                  {formatAmount(option.total)} TL
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
