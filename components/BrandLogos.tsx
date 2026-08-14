// Gecici markalar: gercek logo dosyalari gelene kadar SVG/tipografi yaklasimi.

export function MastercardMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" role="img" aria-label="Mastercard" className={className}>
      <circle cx="15" cy="12" r="10" fill="#EB001B" />
      <circle cx="25" cy="12" r="10" fill="#F79E1B" />
      <path d="M20 3.34a10 10 0 0 1 0 17.32 10 10 0 0 0 0-17.32Z" fill="#FF5F00" />
    </svg>
  );
}

export function VisaMark({ className }: { className?: string }) {
  return (
    <span className={`font-bold italic tracking-tight select-none ${className ?? ""}`}>
      VISA
    </span>
  );
}

export function TroyMark({ className }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight select-none ${className ?? ""}`}>
      tr<span className="text-[#2fbfb0]">o</span>y
    </span>
  );
}

export function PaynkolayMark({ className }: { className?: string }) {
  return (
    <span className={`font-bold italic tracking-tight select-none ${className ?? ""}`}>
      pay&apos;nkolay
    </span>
  );
}
