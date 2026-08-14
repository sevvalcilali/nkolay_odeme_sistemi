import { MastercardMark, TroyMark, VisaMark } from "@/components/BrandLogos";
import InstallmentSelect from "@/components/InstallmentSelect";
import {
  formatExpiryInput,
  groupNumber,
  isExpiryValid,
  passesLuhn,
  toCvvDigits,
  toExpiryDigits,
  toNumberDigits,
} from "@/lib/card";
import type { InstallmentOption } from "@/types/payment";
import { formatAmount } from "@/lib/format";

export type CardFields = {
  name: string;
  numberDigits: string;
  expiryDigits: string;
  cvvDigits: string;
};

type Props = {
  amount: number;
  values: CardFields;
  onChange: (patch: Partial<CardFields>) => void;
  locked: boolean;
  bank: string | null;
  installments: InstallmentOption[];
  loadingInstallments: boolean;
  installmentError: string | null;
  selectedInstallment: number;
  onSelectInstallment: (count: number) => void;
  onShowAllInstallments: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  /** Kayitli karti olmayan musteride verilmez — baglanti geri yonlendirmeye duserdi. */
  savedCardsHref?: string;
};

export default function PaymentForm({
  amount,
  values,
  onChange,
  locked,
  bank,
  installments,
  loadingInstallments,
  installmentError,
  selectedInstallment,
  onSelectInstallment,
  onShowAllInstallments,
  onSubmit,
  submitting,
  error,
  savedCardsHref,
}: Props) {
  // Hata yalnizca alan tamamlandiktan sonra gosterilir; yazarken uyari cikmaz.
  const numberError =
    values.numberDigits.length === 16 && !passesLuhn(values.numberDigits)
      ? "Kart numarası geçersiz"
      : null;

  const expiryError =
    values.expiryDigits.length === 4 && !isExpiryValid(values.expiryDigits, new Date())
      ? "Son kullanma tarihi geçersiz"
      : null;

  const complete =
    values.name.trim().length > 0 &&
    values.numberDigits.length === 16 &&
    values.expiryDigits.length === 4 &&
    values.cvvDigits.length === 3 &&
    !numberError &&
    !expiryError;

  const current = installments.find((option) => option.count === selectedInstallment);
  const payable = complete && !locked && !loadingInstallments && !submitting;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Ödeme Detayları</h1>
        <div className="flex items-center gap-3">
          <MastercardMark className="h-6 w-auto" />
          <VisaMark className="text-lg text-[#1a1f71]" />
          <TroyMark className="text-base text-ink" />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <Field
          label="Ad Soyad"
          placeholder="Kart Sahibinin Adı Soyadı"
          value={values.name}
          onChange={(raw) => onChange({ name: raw })}
          disabled={locked}
        />
        <Field
          label="Kart Numarası"
          placeholder="**** **** **** ****"
          inputMode="numeric"
          value={groupNumber(values.numberDigits)}
          onChange={(raw) => onChange({ numberDigits: toNumberDigits(raw) })}
          disabled={locked}
          invalid={numberError}
        />

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Son Kullanma Tarihi"
            placeholder="__ / __"
            inputMode="numeric"
            value={formatExpiryInput(values.expiryDigits)}
            onChange={(raw) => onChange({ expiryDigits: toExpiryDigits(raw) })}
            disabled={locked}
            invalid={expiryError}
          />
          <Field
            label="CVV"
            placeholder="***"
            inputMode="numeric"
            value={values.cvvDigits}
            onChange={(raw) => onChange({ cvvDigits: toCvvDigits(raw) })}
            disabled={locked}
          />
        </div>

        {loadingInstallments && (
          <p className="text-xs text-muted">Taksit seçenekleri yükleniyor…</p>
        )}

        {installmentError && !loadingInstallments && (
          <p className="text-xs text-danger">{installmentError}</p>
        )}

        {!loadingInstallments && installments.length > 0 && (
          <InstallmentSelect
            bank={bank}
            options={installments}
            selected={selectedInstallment}
            onSelect={onSelectInstallment}
            disabled={locked}
          />
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        <strong className="font-semibold text-ink">Kartınıza uygun taksit seçenekleri</strong>{" "}
        kart bilgileri girildikten sonra otomatik görüntülenecektir.
        <br />
        Tüm kart taksit seçeneklerini görmek için{" "}
        <button type="button" onClick={onShowAllInstallments} className="underline">
          tıklayınız
        </button>
        .
      </p>

      <hr className="mt-6 border-line" />

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!payable}
        className={`mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-[15px] font-medium text-white transition-colors ${
          payable ? "bg-brand" : "bg-brand-soft"
        }`}
      >
        {submitting && <span>Ödeme alınıyor…</span>}

        {!submitting && current && (
          <>
            <span className="text-[13px]">
              {current.count === 1
                ? "Tek Çekim"
                : `${formatAmount(current.monthly)} TL x ${current.count} Taksit`}
            </span>
            <span>•</span>
          </>
        )}
        {!submitting && <span>{formatAmount(amount)} TL Ödeme Yap</span>}
      </button>

      {savedCardsHref && (
        <a href={savedCardsHref} className="mt-4 text-center text-sm font-medium text-brand underline">
          Kayıtlı kartlarımdan öde
        </a>
      )}
    </div>
  );
}

type FieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (raw: string) => void;
  disabled: boolean;
  inputMode?: "numeric";
  invalid?: string | null;
};

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  inputMode,
  invalid,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-[#a8b0c3] disabled:bg-canvas disabled:text-muted ${
          invalid ? "border-danger" : "border-line focus:border-brand"
        }`}
      />
      {invalid && <span className="mt-1 block text-xs text-danger">{invalid}</span>}
    </label>
  );
}
