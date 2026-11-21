export function SealMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="var(--color-seal)" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="1" strokeDasharray="2 2.2" />
      <path d="M25.5 14.2c-1.2-1.6-3.2-2.5-5.6-2.5-3.3 0-5.6 1.8-5.6 4.4 0 5.6 11.4 3.3 11.4 8.2 0 2.4-2.5 4-5.8 4-2.7 0-4.9-1.1-6-3" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
