import { MastercardMark, TroyMark, VisaMark } from "@/components/BrandLogos";
import { detectBrand, type CardBrand } from "@/lib/bin";
import { formatExpiryOnCard, formatNumberOnCard } from "@/lib/card";

type Props = {
  name: string;
  numberDigits: string;
  expiryDigits: string;
  /** Kayitli kartta numara zaten maskeli gelir; yildizla doldurma yapilmaz. */
  maskedNumber?: string;
};

export default function CardPreview({ name, numberDigits, expiryDigits, maskedNumber }: Props) {
  return (
    <div className="relative mx-auto w-full max-w-[400px] pt-3">
      {/* arkadaki dekoratif kart siluetleri */}
      <div className="absolute inset-x-6 -top-1 h-10 rounded-t-2xl bg-white/70" />
      <div className="absolute -right-3 top-2 bottom-6 w-24 rounded-2xl bg-[#f6f1ea]" />

      <div className="relative aspect-[1.586] overflow-hidden rounded-2xl bg-card text-white shadow-lg">
        <Watermark />

        <div className="relative flex h-full flex-col justify-between p-6">
          <BrandOnCard brand={detectBrand(numberDigits)} />

          <div className="space-y-3">
            <p className="text-xl tracking-[0.14em]">{maskedNumber ?? formatNumberOnCard(numberDigits)}</p>
            <div>
              <p className="text-lg font-medium">{name.trim() || "Ad Soyad"}</p>
              <p className="text-sm text-white/90">SKT {formatExpiryOnCard(expiryDigits)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Marka bilinmiyorsa bos yer birakilir: yanlis logo gostermek, hic gostermemekten
// kotudur. Yukseklik korunur, yoksa numara/ad blogu yukari kayar.
function BrandOnCard({ brand }: { brand: CardBrand | null }) {
  if (brand === "mastercard") return <MastercardMark className="h-8 w-auto" />;
  if (brand === "troy") return <TroyMark className="text-[26px] leading-none" />;
  if (brand === "visa") return <VisaMark className="text-[26px] leading-none" />;
  return <div className="h-8" />;
}

function Watermark() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-20" aria-hidden="true">
      <defs>
        <pattern
          id="paynkolay-watermark"
          width="92"
          height="52"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-22)"
        >
          <text
            x="0"
            y="14"
            fill="#ffffff"
            fontSize="13"
            fontWeight="700"
            fontStyle="italic"
          >
            pay&apos;nkolay
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#paynkolay-watermark)" />
    </svg>
  );
}
