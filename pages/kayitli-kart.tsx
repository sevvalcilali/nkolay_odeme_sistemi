import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import CardPreview from "@/components/CardPreview";
import MerchantPanel from "@/components/MerchantPanel";
import SavedCards from "@/components/SavedCards";
import { formatRemaining, remainingSeconds } from "@/lib/format";
import { getOrder } from "@/lib/order";
import { getSavedCards } from "@/lib/savedCards";
import type { InstallmentOption, Order, SavedCard } from "@/types/payment";

type Props = {
  order: Order;
  cards: SavedCard[];
  initialSeconds: number;
};

export default function KayitliKartPage({ order, cards, initialSeconds }: Props) {
  const [selectedToken, setSelectedToken] = useState(cards[0].token);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const selectedCard = cards.find((card) => card.token === selectedToken) ?? cards[0];
  const selected = installments.find((option) => option.count === installmentCount);

  useEffect(() => {
    const tick = () => setSecondsLeft(remainingSeconds(order.expiresAt, Date.now()));
    tick();

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.expiresAt]);

  useEffect(() => {
    let cancelled = false;
    setInstallments([]);
    setInstallmentCount(1);

    fetch("/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: order.ref, bin: selectedCard.bin }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setInstallments(data.installments ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedCard.bin, order.ref]);

  async function deleteCard(token: string) {
    setDeletingToken(token);
    setError(null);

    try {
      const response = await fetch("/api/card-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: order.ref, token }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Kart silinemedi");
        setDeletingToken(null);
        return;
      }

      // Liste sunucudan yeniden okunur; kart kalmazsa kapi kapanir ve forma duseriz.
      await router.replace(router.asPath);
      setDeletingToken(null);
    } catch {
      setError("Sunucuya ulaşılamadı, tekrar deneyin");
      setDeletingToken(null);
    }
  }

  async function payWithSavedCard() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: order.ref, installmentCount, token: selectedToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ödeme başlatılamadı");
        setSubmitting(false);
        return;
      }

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
        <title>Kayıtlı Kartlarım</title>
      </Head>

      <main className="min-h-screen bg-canvas px-4 py-10">
        <div className="mx-auto max-w-[1060px] rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <SavedCards
              cards={cards}
              selectedToken={selectedToken}
              onSelect={setSelectedToken}
              amount={selected?.total ?? order.amount}
              installments={installments}
              selectedInstallment={installmentCount}
              onSelectInstallment={setInstallmentCount}
              newCardHref={`/odeme?ref=${encodeURIComponent(order.ref)}&yeniKart=1`}
              onDelete={deleteCard}
              deletingToken={deletingToken}
              onSubmit={payWithSavedCard}
              submitting={submitting}
              locked={secondsLeft === 0}
              error={error}
            />
            <div className="flex flex-col rounded-2xl bg-panel p-6">
              <CardPreview
                name={order.customerName}
                numberDigits={selectedCard.bin}
                expiryDigits={selectedCard.expiry.replace(/\D/g, "")}
                maskedNumber={selectedCard.maskedNumber}
              />
              <MerchantPanel
                order={order}
                amount={selected?.total ?? order.amount}
                remaining={formatRemaining(secondsLeft)}
                expired={secondsLeft === 0}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "no-store");

  const ref = typeof query.ref === "string" ? query.ref : undefined;
  if (!ref) return { notFound: true };

  const order = getOrder(ref);
  if (!order) return { notFound: true };

  // Kayitli kart yoksa bu ekranin gosterecegi bir sey yok.
  const cards = await getSavedCards(order.customerKey);
  if (cards.length === 0) {
    return { redirect: { destination: `/odeme?ref=${encodeURIComponent(ref)}`, permanent: false } };
  }

  return {
    props: { order, cards, initialSeconds: remainingSeconds(order.expiresAt, Date.now()) },
  };
};
