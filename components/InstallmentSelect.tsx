import { useState } from "react";
import type { InstallmentOption } from "@/types/payment";
import { formatAmount } from "@/lib/format";

type Props = {
  bank: string | null;
  options: InstallmentOption[];
  selected: number;
  onSelect: (count: number) => void;
  disabled: boolean;
};

function installmentLabel(count: number) {
  return count === 1 ? "Peşin" : `${count} Taksit`;
}

function triggerText({ count, monthly, total }: InstallmentOption) {
  if (count === 1) return `Tek Çekim: ${formatAmount(total)} TL`;
  return `${count} Taksit: ${formatAmount(monthly)} TL x ${count} = ${formatAmount(total)} TL`;
}

export default function InstallmentSelect({
  bank,
  options,
  selected,
  onSelect,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.count === selected) ?? options[0];

  return (
    <div>
      <span className="mb-1.5 block text-xs text-muted">Taksit Seçenekleri</span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between rounded-lg border bg-white px-3.5 py-2.5 text-left text-[15px] text-ink disabled:bg-canvas ${
          open ? "border-brand" : "border-line"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {bank && (
            <span className="shrink-0 text-[11px] font-bold tracking-tight">{bank}</span>
          )}
          <span className="truncate">{triggerText(current)}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          {/* Dar ekranda sutunlar sikismasin diye panel yatay kayar. */}
          <div className="overflow-x-auto">
            <div className="min-w-[340px]">
              <div className="grid grid-cols-[44px_1fr_1fr_1fr] px-3 py-3 text-xs font-medium text-ink">
                <span />
                <span className="text-center">Taksit Sayısı</span>
                <span className="text-center">Aylık Ödeme</span>
                <span className="text-center">Toplam</span>
              </div>

              {options.map((option) => (
                <button
                  key={option.count}
                  type="button"
                  onClick={() => {
                    onSelect(option.count);
                    setOpen(false);
                  }}
                  className="grid w-full grid-cols-[44px_1fr_1fr_1fr] items-center px-3 py-2.5 text-sm text-ink hover:bg-canvas"
                >
                  <Radio checked={option.count === selected} />
                  <span className="text-center">{installmentLabel(option.count)}</span>
                  <span className="text-center">{formatAmount(option.monthly)} TL</span>
                  <span className="text-center">{formatAmount(option.total)} TL</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
    >
      <path d="m5 7.5 5 5 5-5" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
