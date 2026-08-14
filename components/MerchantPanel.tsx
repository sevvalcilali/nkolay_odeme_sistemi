import { PaynkolayMark } from "@/components/BrandLogos";
import { formatAmount } from "@/lib/format";
import type { Order } from "@/types/payment";

type Props = {
  order: Order;
  /** Seçili taksite göre ödenecek toplam. Peşinde sipariş tutarına eşittir. */
  amount: number;
  remaining: string;
  expired: boolean;
};

export default function MerchantPanel({ order, amount, remaining, expired }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-ink">
        <p>
          Sayın {order.customerName},
          <br />
          <strong className="font-semibold">{order.merchantName}</strong> tarafından almış
          olduğunuz ürün veya hizmet karşılığı{" "}
          <strong className="font-semibold">{formatAmount(amount)} TL</strong> tutarındaki
          ödeme talebi size PayNKolay aracılığı ile gönderilmiştir.
        </p>
        {expired ? (
          <p className="font-semibold text-[#c0392b]">
            Ödeme süresi doldu. Yeni bir ödeme talebi oluşturmanız gerekiyor.
          </p>
        ) : (
          <p>
            Ödemenizi tamamlamak için{" "}
            <span className="font-semibold text-brand underline">kalan süre: {remaining}</span>
          </p>
        )}
      </div>

      <div className="mt-auto pt-10 text-center text-[13px] leading-relaxed text-muted">
        <p>Bu ödeme işlemi TCMB lisanslı ödeme kuruluşu</p>
        <PaynkolayMark className="my-1 block text-lg text-brand" />
        <p>altyapısı ile gerçekleşmektedir.</p>
      </div>
    </div>
  );
}
