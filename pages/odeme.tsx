import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import CardPreview from "@/components/CardPreview";
import InstallmentModal from "@/components/InstallmentModal";
import MerchantPanel from "@/components/MerchantPanel";
import PaymentForm, { type CardFields } from "@/components/PaymentForm";
import { getModalInstallments } from "@/lib/mockInstallments";
import { formatRemaining, remainingSeconds } from "@/lib/format";
import { createDevOrder, getOrder } from "@/lib/order";
import { getSavedCards } from "@/lib/savedCards";
import type { InstallmentOption, Order } from "@/types/payment";

type Props = {
  order: Order;
  initialSeconds: number;
  /** Kayitli kart ekranina donus baglantisi yalnizca karti olana gosterilir. */
  hasSavedCards: boolean;
};

const EMPTY_FIELDS: CardFields = {
  name: "",
  numberDigits: "",
  expiryDigits: "",
  cvvDigits: "",
};

export default function OdemePage({ order, initialSeconds, hasSavedCards }: Props) {
  const [fields, setFields] = useState<CardFields>(EMPTY_FIELDS);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [bank, setBank] = useState<string | null>(null);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [installmentError, setInstallmentError] = useState<string | null>(null);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [allInstallmentsOpen, setAllInstallmentsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const tick = () => setSecondsLeft(remainingSeconds(order.expiresAt, Date.now()));
    tick();

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.expiresAt]);

  const bin = fields.numberDigits.slice(0, 6);

  useEffect(() => {
    if (bin.length < 6) {
      setInstallments([]);
      setBank(null);
      setInstallmentError(null);
      return;
    }

    let cancelled = false;
    setLoadingInstallments(true);
    setInstallmentError(null);

    fetch("/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: order.ref, bin }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setInstallments([]);
          setInstallmentError(data.error ?? "Taksit seçenekleri alınamadı");
          return;
        }

        setInstallments(data.installments ?? []);
        setBank(data.bank ?? null);
        setInstallmentCount(1);
      })
      .catch(() => {
        if (cancelled) return;
        setInstallments([]);
        setInstallmentError("Taksit seçenekleri alınamadı");
      })
      .finally(() => {
        if (!cancelled) setLoadingInstallments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bin, order.ref]);

  const expired = secondsLeft === 0;
  const selected = installments.find((option) => option.count === installmentCount);
  const payableAmount = selected ? selected.total : order.amount;

  async function submitPayment() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: order.ref,
          installmentCount,
          card: {
            number: fields.numberDigits,
            month: fields.expiryDigits.slice(0, 2),
            year: fields.expiryDigits.slice(2, 4),
            cvv: fields.cvvDigits,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ödeme başlatılamadı");
        setSubmitting(false);
        return;
      }

      // Yonlendirme iptal olursa buton "Ödeme alınıyor…" durumunda kilitli kalmasin.
      const navigated = await router.push(`/sonuc?ref=${encodeURIComponent(order.ref)}`);
      if (!navigated) setSubmitting(false);
    } catch {
      setError("Sunucuya ulaşılamadı, tekrar deneyin");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Ödeme Detayları</title>
      </Head>

      <main className="min-h-screen bg-canvas px-4 py-10">
        <div className="mx-auto max-w-[1060px] rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <PaymentForm
              amount={payableAmount}
              values={fields}
              onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
              locked={expired}
              bank={bank}
              installments={installments}
              loadingInstallments={loadingInstallments}
              installmentError={installmentError}
              selectedInstallment={installmentCount}
              onSelectInstallment={setInstallmentCount}
              onShowAllInstallments={() => setAllInstallmentsOpen(true)}
              onSubmit={submitPayment}
              submitting={submitting}
              error={error}
              savedCardsHref={
                hasSavedCards ? `/kayitli-kart?ref=${encodeURIComponent(order.ref)}` : undefined
              }
            />
            <div className="flex flex-col rounded-2xl bg-panel p-6">
              <CardPreview
                name={fields.name}
                numberDigits={fields.numberDigits}
                expiryDigits={fields.expiryDigits}
              />
              <MerchantPanel
                order={order}
                amount={payableAmount}
                remaining={formatRemaining(secondsLeft)}
                expired={expired}
              />
            </div>
          </div>
        </div>
      </main>

      <InstallmentModal
        open={allInstallmentsOpen}
        onClose={() => setAllInstallmentsOpen(false)}
        options={getModalInstallments(order.amount)}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, res }) => {
  // Odeme verisi tasiyan sayfalar ara katman veya tarayici onbellegine girmemeli.
  res.setHeader("Cache-Control", "no-store");

  const ref = typeof query.ref === "string" ? query.ref : undefined;

  if (!ref) {
    if (process.env.NODE_ENV === "production") return { notFound: true };
    return { redirect: { destination: `/odeme?ref=${createDevOrder()}`, permanent: false } };
  }

  const order = getOrder(ref);
  if (!order) return { notFound: true };

  // Kapi: kayitli karti olan once secim ekranina duser. "Yeni kartla öde"
  // baglantisi yeniKart=1 ile gelir ve kapiyi bilinçli olarak atlar — ama liste
  // yine de okunur, cunku forma dusen musteriye geri donus baglantisi verilecek.
  const savedCards = await getSavedCards(order.customerKey);
  if (savedCards.length > 0 && query.yeniKart !== "1") {
    return {
      redirect: { destination: `/kayitli-kart?ref=${encodeURIComponent(ref)}`, permanent: false },
    };
  }

  return {
    props: {
      order,
      initialSeconds: remainingSeconds(order.expiresAt, Date.now()),
      hasSavedCards: savedCards.length > 0,
    },
  };
};
