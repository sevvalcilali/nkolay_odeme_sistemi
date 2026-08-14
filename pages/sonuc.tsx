import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { PaynkolayMark } from "@/components/BrandLogos";
import { formatAmount } from "@/lib/format";
import { getOrder, getPaymentResult } from "@/lib/order";
import type { Order, PaymentRecord } from "@/types/payment";

type Props = {
  order: Order;
  payment: PaymentRecord | null;
};

// Iptal ve iade tek durumu paylasir; musteriye anlatimi kayittaki `reversal` ayirir.
type ResultState = "pending" | "success" | "cancelled" | "refunded" | "failed";

const HEADINGS: Record<ResultState, string> = {
  pending: "Ödeme henüz tamamlanmadı",
  success: "Ödemeniz alındı",
  cancelled: "Ödeme iptal edildi",
  refunded: "Ödemeniz iade edildi",
  failed: "Ödeme tamamlanamadı",
};

// Odeme baslatilip sonucu okunamadiginda kayit PENDING kalir.
function stateOf(payment: PaymentRecord | null): ResultState {
  if (!payment || payment.status === "PENDING") return "pending";
  if (payment.status === "SUCCESS") return "success";
  if (payment.status === "CANCELLED") {
    return payment.reversal === "refund" ? "refunded" : "cancelled";
  }
  return "failed";
}

export default function SonucPage({ order, payment }: Props) {
  const state = stateOf(payment);

  return (
    <>
      <Head>
        <title>{state === "success" ? "Ödeme Tamamlandı" : "Ödeme Sonucu"}</title>
      </Head>

      <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-[520px] rounded-2xl bg-white p-8 shadow-sm">
          <StatusMark state={state} />

          <h1 className="mt-5 text-center text-xl font-semibold text-ink">{HEADINGS[state]}</h1>

          <p className="mt-2 text-center text-[15px] leading-relaxed text-muted">
            {!payment
              ? "Bu sipariş için henüz bir ödeme kaydı yok."
              : state === "pending"
                ? "İşleminiz sürüyor. Sonuç netleşene kadar tekrar denemeyin."
                : state === "success"
                  ? `${order.merchantName} adına yapılan ödeme başarıyla tamamlandı.`
                  : state === "cancelled"
                    ? "Bu ödeme iptal edildi, karttaki bloke kaldırıldı."
                    : state === "refunded"
                      ? "Tutar kartınıza iade edildi. Hesabınıza geçmesi bankanıza göre birkaç iş günü sürebilir."
                      : payment.message}
          </p>

          <dl className="mt-7 divide-y divide-line border-y border-line text-[15px]">
            <Row label="Sipariş" value={order.ref} />
            {payment && state !== "pending" && (
              <>
                <Row
                  label="Taksit"
                  value={payment.installmentCount === 1 ? "Tek Çekim" : `${payment.installmentCount} Taksit`}
                />
                <Row label="Tutar" value={`${formatAmount(payment.chargedAmount)} TL`} />
                {payment.referenceCode && <Row label="İşlem No" value={payment.referenceCode} />}
                {state === "success" && payment.authCode && (
                  <Row label="Onay Kodu" value={payment.authCode} />
                )}
              </>
            )}
          </dl>

          {/* Iptal terminal durumdur — tekrar denenecek bir sey yok. */}
          {state === "failed" && (
            <Link
              href={`/odeme?ref=${encodeURIComponent(order.ref)}`}
              className="mt-7 block w-full rounded-lg bg-brand py-3.5 text-center text-[15px] font-medium text-white"
            >
              Tekrar dene
            </Link>
          )}

          <div className="mt-8 text-center text-[13px] leading-relaxed text-muted">
            <p>Bu ödeme işlemi TCMB lisanslı ödeme kuruluşu</p>
            <PaynkolayMark className="my-1 block text-lg text-brand" />
            <p>altyapısı ile gerçekleşmektedir.</p>
          </div>
        </div>
      </main>
    </>
  );
}

// Geri alma ne basari ne hata: kirmizi carpi kullanici hata yapmis izlenimi verir.
const TONES: Record<ResultState, string> = {
  pending: "text-muted",
  success: "text-ok",
  cancelled: "text-muted",
  refunded: "text-muted",
  failed: "text-danger",
};

const MARKS: Record<ResultState, string> = {
  pending: "M12 7v6l3.5 2",
  success: "m5 12.5 4.5 4.5L19 7.5",
  cancelled: "M7 12h10",
  /** Geri donen ok — iade parayi karta geri gonderir. */
  refunded: "M9 14H5v4M5 14l3.5 3.5a7 7 0 1 0 0-11",
  failed: "M7 7l10 10M17 7L7 17",
};

function StatusMark({ state }: { state: ResultState }) {
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 ${TONES[state]}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARKS[state]} />
      </svg>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "no-store");

  const ref = typeof query.ref === "string" ? query.ref : undefined;
  if (!ref) return { notFound: true };

  const order = getOrder(ref);
  if (!order) return { notFound: true };

  return { props: { order, payment: getPaymentResult(ref) } };
};
