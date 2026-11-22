/**
 * Brand elements shared with the pitch deck: the wax seal (raster, from the deck artwork),
 * a drawn envelope, and four line icons for the reporting steps.
 */
import Image from "next/image";

export function WaxSeal({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/wax-seal.webp"
      alt=""
      aria-hidden
      width={480}
      height={489}
      priority={priority}
      className={`pointer-events-none select-none drop-shadow-[0_18px_22px_rgba(80,10,6,0.35)] ${className}`}
    />
  );
}

/** A paper envelope, drawn to sit behind the wax seal. */
export function Envelope({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 360" className={className} aria-hidden>
      <defs>
        <linearGradient id="env-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfaf6" />
          <stop offset="1" stopColor="#ece8df" />
        </linearGradient>
        <linearGradient id="env-flap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f5ef" />
          <stop offset="1" stopColor="#e6e1d6" />
        </linearGradient>
        <filter id="env-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#14161b" floodOpacity="0.16" />
        </filter>
      </defs>
      {/* the second sheet peeking out behind */}
      <rect x="40" y="18" width="460" height="300" rx="6" fill="#efebe2" stroke="#ddd7ca" transform="rotate(4 270 168)" />
      <g filter="url(#env-shadow)">
        <rect x="20" y="40" width="460" height="300" rx="8" fill="url(#env-body)" stroke="#dcd6c9" />
        {/* lower folds */}
        <path d="M20 340 L250 175 L480 340" fill="none" stroke="#d9d3c5" strokeWidth="1.5" />
        {/* top flap */}
        <path d="M22 44 L250 205 L478 44 Z" fill="url(#env-flap)" stroke="#d6cfc0" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M40 50 L250 196 L460 50" fill="none" stroke="#e9e4d9" strokeDasharray="3 5" />
      </g>
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconSeal({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3.5" y="7.5" width="25" height="17" rx="2" {...stroke} />
      <path d="M4 8.5 16 17.5 28 8.5" {...stroke} />
      <circle cx="16" cy="18" r="3.2" fill="var(--color-seal)" />
    </svg>
  );
}

export function IconAnchor({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M4 13.5 9.5 10.5 15 13.5v6L9.5 22.5 4 19.5z" {...stroke} />
      <path d="M4 13.5 9.5 16.5 15 13.5M9.5 16.5v6" {...stroke} />
      <path d="M17 12.5 22.5 9.5 28 12.5v6L22.5 21.5 17 18.5z" fill="var(--color-seal)" fillOpacity="0.9" stroke="var(--color-seal)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15 16.5h2" {...stroke} />
    </svg>
  );
}

export function IconRespond({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M8 4.5h11l5 5v18H8z" {...stroke} />
      <path d="M19 4.5v5h5M12 13h7M12 16.5h5" {...stroke} />
      <path d="m12.5 22 2.6 2.6 5.4-5.6" fill="none" stroke="var(--color-ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconEscalate({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M14 11.5 21.5 7 29 11.5M15 12.5h13M16.5 13v9M20 13v9M23.5 13v9M27 13v9M14.5 23.5h14" {...stroke} />
      <path d="M4 26V17a5 5 0 0 1 5-5h1" fill="none" stroke="var(--color-seal)" strokeWidth="2" strokeLinecap="round" />
      <path d="m7.5 9 3 3-3 3" fill="none" stroke="var(--color-seal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
