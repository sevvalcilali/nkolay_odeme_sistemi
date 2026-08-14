import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useState } from "react";
import { formatAmount, trxDateLabel } from "@/lib/format";
import { hasSession, isConfigured } from "@/lib/operatorAuth";
import type { ReversalType } from "@/types/payment";

type Props = {
  configured: boolean;
  authed: boolean;
  todayLabel: string;
};

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "missing" }
  | {
      state: "found";
      orderRef: string;
      amount: number;
      status: string;
      reversal: ReversalType | null;
      installmentCount: number;
      authCode: string | null;
      trxDateLabel: string;
      sameDay: boolean;
    };

type Outcome = {
  ok: boolean;
  type: ReversalType;
  message: string;
  authCode?: string | null;
  verified?: boolean;
};

export default function IptalIadePage({ configured, authed, todayLabel }: Props) {
  const [signedIn, setSignedIn] = useState(authed);

  return (
    <>
      <Head>
        <title>İptal / İade İşlemi</title>
      </Head>

      <main className="min-h-screen bg-canvas px-4 py-10">
        {!configured ? (
          <Notice />
        ) : signedIn ? (
          <CancelPanel todayLabel={todayLabel} onSignOut={() => setSignedIn(false)} />
        ) : (
          <SignIn onSuccess={() => setSignedIn(true)} />
        )}
      </main>
    </>
  );
}

function Notice() {
  return (
    <div className="mx-auto max-w-[420px] rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-ink">Panel kapalı</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Bu ekranı açmak için <code className="text-ink">CANCEL_PANEL_PASSWORD</code> ortam
        değişkeni tanımlanmalıdır.
      </p>
    </div>
  );
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/cancel-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Giriş yapılamadı");
        setBusy(false);
        return;
      }

      onSuccess();
    } catch {
      setError("Sunucuya ulaşılamadı");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (password && !busy) submit();
      }}
      className="mx-auto max-w-[400px] rounded-2xl bg-white p-8 shadow-sm"
    >
      <Badge />
      <h1 className="mt-4 text-xl font-semibold text-ink">İptal / İade Paneli</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Bu ekran satıcı içindir. Devam etmek için panel şifresini girin.
      </p>

      <div className="mt-6">
        <Field
          label="Panel Şifresi"
          placeholder="••••••••"
          type="password"
          value={password}
          onChange={setPassword}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      <button
        type="submit"
        disabled={!password || busy}
        className={`mt-6 w-full rounded-lg py-3.5 text-[15px] font-medium text-white transition-colors ${
          password && !busy ? "bg-brand" : "bg-brand-soft"
        }`}
      >
        {busy ? "Kontrol ediliyor…" : "Giriş Yap"}
      </button>
    </form>
  );
}

function CancelPanel({ todayLabel, onSignOut }: { todayLabel: string; onSignOut: () => void }) {
  const [type, setType] = useState<ReversalType>("cancel");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetFor(next: string) {
    setReference(next);
    setLookup({ state: "idle" });
    setAmount("");
    setConfirmed(false);
    setOutcome(null);
    setError(null);
  }

  // Tip degisince onceki sonuc ekranda kalirsa diger tipe aitmis gibi okunur.
  function selectType(next: ReversalType) {
    setType(next);
    setOutcome(null);
    setError(null);
  }

  async function runLookup() {
    const trimmed = reference.trim();
    if (!trimmed || lookup.state !== "idle") return;

    setLookup({ state: "loading" });

    try {
      const response = await fetch("/api/cancel-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode: trimmed }),
      });

      const data = await response.json();
      if (!response.ok || !data.found) {
        setLookup({ state: "missing" });
        return;
      }

      setLookup({ state: "found", ...data });
      setAmount(formatAmount(data.amount));
    } catch {
      setLookup({ state: "missing" });
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setOutcome(null);

    try {
      const response = await fetch("/api/cancel-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceCode: reference.trim(),
          type,
          amount,
          confirmUnverified: lookup.state !== "found" ? confirmed : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "İptal isteği gönderilemedi");
        return;
      }

      setOutcome(data);
    } catch {
      setError("Sunucuya ulaşılamadı, tekrar deneyin");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/cancel-login", { method: "DELETE" });
    onSignOut();
  }

  const refund = type === "refund";
  const unverified = lookup.state === "missing";
  const reversed = lookup.state === "found" && lookup.status === "CANCELLED";
  // Iade tarihi yalnizca kayittan okunur; kayit yoksa iade hic denenmez.
  const needsRecord = refund && lookup.state !== "found";
  const ready =
    reference.trim().length > 0 &&
    amount.trim().length > 0 &&
    !busy &&
    !reversed &&
    !needsRecord &&
    lookup.state !== "loading" &&
    (refund || !unverified || confirmed);

  return (
    <div className="mx-auto max-w-[620px]">
      <div className="flex items-center justify-between">
        <Badge />
        <button type="button" onClick={signOut} className="text-[13px] text-muted underline">
          Çıkış
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-ink">İptal / İade İşlemi</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Referans numarasıyla bir ödemeyi geri alır. Aynı gün iptal, sonraki günler iade —
          ayrımı gün sonu kapanışı koyar.
        </p>

        <div className="mt-6 space-y-4">
          <Field
            label="Referans No"
            placeholder="IKSIRPF000000"
            value={reference}
            onChange={resetFor}
            onBlur={runLookup}
            mono
            hint={lookup.state === "loading" ? "Kayıt aranıyor…" : undefined}
          />

          {lookup.state === "found" && <RecordPanel record={lookup} />}

          {needsRecord && lookup.state !== "loading" && (
            <p className="rounded-xl border border-line bg-panel p-4 text-[12px] leading-relaxed text-muted">
              <span className="font-medium text-ink">İade için işlemin kaydı gerekli.</span> İade,
              işlemin kendi tarihiyle gönderilir; bu tarih tahmin edilemez, kayıttan okunur. Kaydı
              olmayan bir referans yalnızca iptal edilebilir.
            </p>
          )}

          {refund && lookup.state === "found" && lookup.sameDay && (
            <p className="rounded-xl border border-line bg-panel p-4 text-[12px] leading-relaxed text-muted">
              <span className="font-medium text-ink">Bu işlem bugüne ait.</span> Servis aynı gün
              iade kabul etmiyor — bugün için doğru işlem iptaldir, iade en erken yarın yapılabilir.
            </p>
          )}

          {unverified && !refund && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <p className="text-[13px] font-medium text-danger">
                Bu referans kayıtlarımızda bulunamadı
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Tutarı doğrulayamıyoruz. İptal servisi girdiğiniz tutarı kontrol etmez — yanlış
                tutar sessizce kabul edilir. Devam etmeden önce tutarı işlem dekontuyla
                karşılaştırın.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 accent-[#c0392b]"
                />
                <span className="text-[12px] leading-relaxed text-ink">
                  Tutarı doğruladım, iptali onaylıyorum.
                </span>
              </label>
            </div>
          )}

          <Field
            label="Tutar (TL)"
            placeholder="0,00"
            value={amount}
            onChange={setAmount}
            readOnly={lookup.state === "found"}
            hint={
              lookup.state === "found" ? "Kayıttaki tahsilat tutarı — değiştirilemez" : undefined
            }
          />

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="İşlem Tarihi"
              placeholder=""
              value={lookup.state === "found" ? lookup.trxDateLabel : todayLabel}
              readOnly
              hint={lookup.state === "found" ? "İşlemin kendi tarihi" : "Bugün"}
            />
            <div>
              <span className="mb-1.5 block text-xs text-muted">İşlem Tipi</span>
              <div className="flex rounded-lg border border-line p-1">
                {TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectType(option.value)}
                    className={`flex-1 rounded-md py-1.5 text-center text-[13px] transition-colors ${
                      type === option.value
                        ? "bg-brand font-medium text-white"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-xs text-muted">
                {refund ? "Ertesi gün ve sonrası" : "Aynı gün"}
              </span>
            </div>
          </div>
        </div>

        <hr className="mt-6 border-line" />

        {error && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>
        )}

        {outcome && <Result outcome={outcome} />}

        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className={`mt-6 w-full rounded-lg py-3.5 text-[15px] font-medium text-white transition-colors ${
            ready ? "bg-brand" : "bg-brand-soft"
          }`}
        >
          {busy ? "Gönderiliyor…" : refund ? "İadeyi Gönder" : "İşlemi İptal Et"}
        </button>
      </div>
    </div>
  );
}

function RecordPanel({
  record,
}: {
  record: Extract<Lookup, { state: "found" }>;
}) {
  return (
    <div className="rounded-xl bg-panel p-4">
      <dl className="text-[13px]">
        <Row label="Sipariş No" value={record.orderRef} />
        <Row label="Tahsil Edilen" value={`${formatAmount(record.amount)} TL`} />
        <Row
          label="Taksit"
          value={record.installmentCount === 1 ? "Tek Çekim" : `${record.installmentCount} Taksit`}
        />
        {record.authCode && <Row label="Onay Kodu" value={record.authCode} />}
      </dl>

      {record.status === "CANCELLED" && (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-[12px] font-medium text-muted">
          {record.reversal === "refund"
            ? "Bu işlem daha önce iade edildi."
            : "Bu işlem daha önce iptal edildi."}
        </p>
      )}
    </div>
  );
}

function Result({ outcome }: { outcome: Outcome }) {
  const tone = outcome.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger";
  const done = outcome.type === "refund" ? "İade edildi" : "İptal edildi";

  return (
    <div className={`mt-4 rounded-lg px-3.5 py-3 text-sm ${tone}`}>
      <p className="font-medium">{outcome.ok ? done : outcome.message}</p>
      {outcome.ok && (
        <p className="mt-1 text-[12px] opacity-80">
          {outcome.verified
            ? "Tutar kayıtla doğrulandı."
            : "Tutar kayıttan doğrulanamadı, operatör onayıyla yapıldı."}
          {outcome.authCode && ` Onay kodu: ${outcome.authCode}`}
        </p>
      )}
    </div>
  );
}

const TYPES: { value: ReversalType; label: string }[] = [
  { value: "cancel", label: "İptal" },
  { value: "refund", label: "İade" },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function Badge() {
  return (
    <span className="inline-block rounded-md bg-panel px-2.5 py-1 text-[11px] font-medium tracking-wide text-brand uppercase">
      Satıcı Ekranı
    </span>
  );
}

type FieldProps = {
  label: string;
  placeholder: string;
  value: string;
  /** Salt okunur alanlarda verilmez. */
  onChange?: (raw: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  mono?: boolean;
  hint?: string;
  type?: "password";
};

function Field({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  readOnly,
  mono,
  hint,
  type,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      <input
        type={type ?? "text"}
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        className={`w-full rounded-lg border border-line px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-[#a8b0c3] focus:border-brand ${
          readOnly ? "bg-canvas text-muted" : "bg-white"
        } ${mono ? "font-mono tracking-wide" : ""}`}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "no-store");

  const now = new Date();
  const configured = isConfigured();

  return {
    props: {
      configured,
      authed: configured && hasSession(req, now.getTime()),
      todayLabel: trxDateLabel(now),
    },
  };
};
