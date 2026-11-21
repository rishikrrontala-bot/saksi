"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { getState } from "@/lib/client";
import type { ChainState } from "@/lib/chain";
import { CHAIN_NAME, STATUS_LABELS } from "@/lib/config";
import { formatDuration, isOverdue } from "@/lib/metrics";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const EASE_OUT = "expo.out";
const MOTION_OK = "(prefers-reduced-motion: no-preference)";

function useChainState(intervalMs = 8000) {
  const [s, setS] = useState<ChainState | null>(null);
  useEffect(() => {
    const load = () =>
      getState()
        .then((st) => setS({ ...st, now: Math.max(st.now, Math.floor(Date.now() / 1000)) }))
        .catch(() => undefined);
    load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return s;
}

const shortName = (name: string) => name.split(" \u2014 ")[0];

/* ------------------------------------------------------------------ hero image */

/** The real verifier screenshot, floating in from the bottom right; drifts slower than the page on scroll. */
export function HeroShot() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(ref.current, { y: 60, opacity: 0, rotate: 0, duration: 1.1, ease: EASE_OUT, delay: 0.25 });
        gsap.to(ref.current, {
          yPercent: -12,
          ease: "none",
          scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true },
        });
      });
    },
    { scope: ref }
  );
  return (
    <div ref={ref} className="pointer-events-none relative mx-auto w-full max-w-3xl rotate-[-2deg] lg:absolute lg:-bottom-24 lg:right-[-6%] lg:w-[54%]">
      <div className="overflow-hidden rounded-[22px] border border-line bg-card p-1.5 shadow-[0_50px_80px_-40px_rgba(20,22,27,0.55)]">
        <Image
          src="/shots/verify.jpg"
          alt="SAKSI verifier on Base Sepolia: receipt checks pass and the institution has missed its deadline"
          width={1800}
          height={1125}
          priority
          className="h-auto w-full rounded-[16px]"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ live marquee */

/** Real anchored reports, straight from the registry, scrolling past. Constant motion, linear. */
export function ChainMarquee() {
  const s = useChainState();
  const items = useMemo(() => {
    if (!s) return [];
    return [...s.reports].reverse().map((r) => {
      const inst = s.institutions.find((i) => i.id === r.institutionId);
      const overdue = isOverdue(r, inst, s.now);
      const state = r.escalatedAt ? "Escalated" : overdue ? "Overdue" : STATUS_LABELS[r.status];
      return { id: r.id, inst: inst ? shortName(inst.name) : "", hash: `${r.commitment.slice(0, 10)}…${r.commitment.slice(-4)}`, state, alert: !!r.escalatedAt || overdue };
    });
  }, [s]);
  if (!items.length) return <div className="h-16" aria-hidden />;
  const row = (dup: boolean) => (
    <ul className="flex shrink-0 items-center gap-10 pr-10" aria-hidden={dup}>
      {items.map((it) => (
        <li key={`${dup}-${it.id}`} className="flex items-center gap-3 whitespace-nowrap text-sm">
          <span className="font-mono text-xs text-muted">#{it.id}</span>
          <span className="font-mono text-ink-2">{it.hash}</span>
          <span className="text-muted">{it.inst}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${it.alert ? "bg-seal-soft text-seal" : "bg-ok-soft text-ok"}`}>{it.state}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="marquee relative z-10 overflow-hidden border-y border-line bg-paper py-5 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
      <p className="sr-only">{items.length} reports anchored on {CHAIN_NAME}.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ bento: live stats card */

export function LiveRegistryCard() {
  const s = useChainState();
  const overdue = s ? s.reports.filter((r) => isOverdue(r, s.institutions.find((i) => i.id === r.institutionId), s.now)).length : null;
  const acked = s ? s.reports.filter((r) => r.acknowledgedAt > 0) : [];
  const median = (() => {
    if (!s || !acked.length) return null;
    const xs = acked.map((r) => r.acknowledgedAt - r.submittedAt).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  })();
  const rows: [string, string, boolean?][] = [
    ["Reports anchored on-chain", s ? String(s.reports.length) : "…"],
    ["Acknowledged by a task force", s ? String(acked.length) : "…"],
    ["Overdue right now", overdue == null ? "…" : String(overdue), true],
    ["Escalated to the ministry", s ? String(s.reports.filter((r) => r.escalatedAt > 0).length) : "…", true],
  ];
  return (
    <div className="flex h-full flex-col justify-between rounded-[28px] bg-forest p-7 text-paper sm:p-9">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paper/60">Live from the registry</p>
        <span className="flex items-center gap-2 text-xs text-paper/60">
          <span className="h-2 w-2 rounded-full bg-[#5fd39b]" /> {CHAIN_NAME}
        </span>
      </div>
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8">
        {rows.map(([label, v, alert]) => (
          <div key={label}>
            <dd className={`font-display text-5xl font-semibold tabular-nums sm:text-6xl ${alert && v !== "0" && v !== "…" ? "text-[#ff8f80]" : ""}`}>{v}</dd>
            <dt className="mt-2 text-sm text-paper/70">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm text-paper/60">
        Median time to acknowledge: <span className="font-mono text-paper">{formatDuration(median)}</span>. Every number is read from
        public chain data on each visit.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ how it works: horizontal accordion */

const STEPS = [
  {
    title: "Seal",
    body: "Write what happened. An optional open-weight AI helps structure it, quoting your own words. Your browser encrypts it with AES-256-GCM, so SAKSI only ever stores ciphertext.",
  },
  {
    title: "Anchor",
    body: "A fingerprint of the sealed report goes on a public chain with a block timestamp. You keep a Sealed Receipt (PDF + QR) that proves it existed, and when.",
  },
  {
    title: "Respond",
    body: "The institution's task force decrypts it in its own browser and must acknowledge it with a wallet-signed transaction. Response times become public.",
  },
  {
    title: "Escalate",
    body: "No acknowledgement inside the window? One click hands the report to the ministry. The contract enforces the deadline, not the institution and not SAKSI.",
  },
];

export function StepsAccordion() {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col gap-3 lg:h-[440px] lg:flex-row">
      {STEPS.map((s, i) => {
        const active = open === i;
        return (
          <button
            key={s.title}
            type="button"
            onMouseEnter={() => setOpen(i)}
            onFocus={() => setOpen(i)}
            onClick={() => setOpen(i)}
            aria-expanded={active}
            className={`group relative flex flex-col justify-between overflow-hidden rounded-[28px] border p-7 text-left transition-[flex-grow,background-color,border-color] duration-500 ease-[cubic-bezier(0.77,0,0.175,1)] lg:min-w-0 lg:basis-0 ${
              active ? "border-ink bg-ink text-paper lg:grow-[3.2]" : "border-line bg-card text-ink hover:border-ink/40 lg:grow"
            }`}
          >
            <h3 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{s.title}</h3>
            <p
              className={`mt-6 max-w-md text-[15px] leading-relaxed transition-opacity duration-300 lg:mt-0 ${
                active ? "text-paper/80 opacity-100 delay-150" : "text-muted lg:opacity-0"
              }`}
            >
              {s.body}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ product shots: card stacking */

const SHOTS = [
  {
    src: "/shots/receipt.jpg",
    title: "The Sealed Receipt",
    body: "Report number, block timestamp, fingerprint and transaction, with a QR anyone can scan. The PDF also carries the reporter's key.",
  },
  {
    src: "/shots/verify.jpg",
    title: "Verify, then escalate",
    body: "The fingerprint, the stored ciphertext and the decryption are checked in your browser. Miss the deadline and escalation opens.",
  },
  {
    src: "/shots/ledger.jpg",
    title: "The public ledger",
    body: "On-time rates, medians and overdue counts, rebuilt from contract events. Nobody can edit them, including us.",
  },
];

export function StackedShots() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const cards = gsap.utils.toArray<HTMLElement>(".stack-card");
        cards.forEach((card, i) => {
          if (i === cards.length - 1) return;
          // Earlier cards settle back (scale + dim) as the next one slides over them.
          gsap.to(card.querySelector(".stack-inner"), {
            scale: 0.92,
            opacity: 0.35,
            ease: "none",
            scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top 18%", scrub: true },
          });
        });
      });
    },
    { scope: root }
  );
  return (
    <div ref={root} className="relative">
      {SHOTS.map((s, i) => (
        <div key={s.src} className="stack-card sticky pb-10" style={{ top: `${96 + i * 22}px` }}>
          <article className="stack-inner group grid origin-top gap-8 overflow-hidden rounded-[32px] border border-line bg-card p-5 shadow-[0_40px_80px_-50px_rgba(20,22,27,0.5)] sm:p-8 lg:grid-cols-[1fr_1.5fr] lg:items-center">
            <div className="px-2 sm:px-4">
              <h3 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{s.title}</h3>
              <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-muted">{s.body}</p>
            </div>
            <div className="overflow-hidden rounded-[20px] border border-line">
              <Image
                src={s.src}
                alt={s.title}
                width={1800}
                height={1125}
                className="h-auto w-full transition-transform duration-700 ease-out group-hover:scale-105"
              />
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ scrubbed text reveal */

export function ScrubText({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          gsap.utils.toArray<HTMLElement>(".scrub-word"),
          { opacity: 0.12 },
          { opacity: 1, stagger: 0.05, ease: "none", scrollTrigger: { trigger: ref.current, start: "top 80%", end: "bottom 45%", scrub: true } }
        );
      });
    },
    { scope: ref }
  );
  return (
    <p ref={ref} className={className}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="scrub-word">
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------ hero entrance */

export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(ref.current, { y: 24, opacity: 0, duration: 0.9, ease: EASE_OUT, delay });
      });
    },
    { scope: ref }
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
