"use client";

import { useEffect, useState } from "react";
import { STATUS_LABELS } from "@/lib/config";
import { formatDuration } from "@/lib/metrics";

export function Hash({ value, head = 10, tail = 8, className = "" }: { value: string; head?: number; tail?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={`font-mono text-[12.5px] text-ink-2 underline decoration-line decoration-dotted underline-offset-4 hover:decoration-ink ${className}`}
    >
      {copied ? "copied" : short}
    </button>
  );
}

const STATUS_STYLE = [
  "bg-info-soft text-info",
  "bg-ok-soft text-ok",
  "bg-warn-soft text-warn",
  "bg-ok-soft text-ok",
  "bg-ok-soft text-ok",
];

export function StatusPill({ status, overdue, escalated }: { status: number; overdue?: boolean; escalated?: boolean }) {
  if (escalated && status <= 1 && overdue !== false)
    return <Pill className="bg-seal text-white">Escalated to ministry</Pill>;
  if (overdue) return <Pill className="bg-seal-soft text-seal">Overdue — not acknowledged</Pill>;
  return <Pill className={STATUS_STYLE[status] ?? "bg-line"}>{STATUS_LABELS[status] ?? "Unknown"}</Pill>;
}

export function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Check({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 10.5l3.5 3.5L16 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ticks once a second; returns unix seconds offset to match chain time when provided. */
export function useNow(chainOffset = 0) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000) + chainOffset);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000) + chainOffset), 1000);
    return () => clearInterval(t);
  }, [chainOffset]);
  return now;
}

export function Countdown({ until, now }: { until: number; now: number }) {
  const left = until - now;
  if (left <= 0) return <span className="font-semibold text-seal">window closed {formatDuration(-left)} ago</span>;
  return <span className="font-mono tabular-nums">{formatDuration(left)} left</span>;
}

export function fmtTime(unix: number) {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  const local = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
  const wib = d.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${local} · ${wib} WIB`;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg border border-seal/30 bg-seal-soft px-3 py-2 text-sm text-seal-dark">{error}</p>;
}

export function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="label mb-2">{kicker}</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-[15px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}
