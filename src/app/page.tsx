import Link from "next/link";
import { LiveStats } from "@/components/LiveStats";
import { CHAIN_NAME } from "@/lib/config";

const FACTS = [
  {
    n: "2,621",
    t: "bullying reports to the Health Ministry's residency channel by 30 March 2025 — 620 of them confirmed as bullying.",
    src: "IDN Times, 22 Apr 2025",
    href: "https://www.idntimes.com/news/indonesia/kemenkes-catat-2-621-laporan-bullying-selama-2025-00-xvwcc-wk7vzh",
  },
  {
    n: "63%",
    t: "of lecturers who knew of sexual violence on their campus did not report it (Ministry of Education survey, 2020).",
    src: "CNN Indonesia, 11 Nov 2021",
    href: "https://www.cnnindonesia.com/nasional/20211111093436-20-719583/survei-nadiem-77-persen-dosen-akui-ada-kekerasan-seksual-di-kampus",
  },
  {
    n: "4,303",
    t: "higher-education institutions must run a reporting task force under Permendikbudristek 55/2024 — none can prove it received a report.",
    src: "Kemdiktisaintek, Statistik PT 2025",
    href: "https://kemdiktisaintek.go.id/library/book/statistik-pendidikan-tinggi-2025",
  },
];

const STEPS = [
  ["Seal", "Write what happened — with an optional open-weight AI helping structure it. Your browser encrypts it with AES-256-GCM. SAKSI only ever stores ciphertext."],
  ["Anchor", "A fingerprint of the sealed report goes on a public chain with a block timestamp. You keep a Sealed Receipt (PDF + QR) that proves it existed, and when."],
  ["Respond on the record", "The institution's task force decrypts it in its own browser and must acknowledge it with a wallet-signed transaction. Response times become public."],
  ["Escalate", "No acknowledgement inside the window? One click hands the report to the ministry. The contract enforces the deadline — not the institution, not SAKSI."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-end">
        <div>
          <p className="label mb-4">Saksi — Indonesian for &ldquo;witness&rdquo;</p>
          <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-[64px]">
            Reports the institution <span className="text-seal">can&apos;t bury.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
            Anonymous misconduct reporting for campuses and teaching hospitals. No account, no wallet, no name. The report is sealed in
            your browser, its fingerprint is anchored on a public chain, and the institution&apos;s response time becomes data anyone can
            check.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/report" className="btn-seal px-5 py-3 text-[15px]">
              File a sealed report
            </Link>
            <Link href="/verify" className="btn-ghost px-5 py-3 text-[15px]">
              Check a receipt
            </Link>
            <Link href="/ledger" className="btn-ghost px-5 py-3 text-[15px]">
              Accountability ledger
            </Link>
          </div>
        </div>
        <LiveStats />
      </section>

      <section className="grid gap-4 border-t border-line py-12 md:grid-cols-3">
        {FACTS.map((f) => (
          <figure key={f.n}>
            <p className="font-display text-5xl font-semibold text-seal">{f.n}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{f.t}</p>
            <a href={f.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-muted underline">
              {f.src} ↗
            </a>
          </figure>
        ))}
      </section>

      <section className="border-t border-line py-12">
        <p className="label mb-6">How it works</p>
        <ol className="grid gap-6 md:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="card p-5">
              <p className="font-mono text-xs text-seal">0{i + 1}</p>
              <h3 className="mt-2 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 border-t border-line py-12 lg:grid-cols-[1fr_1.3fr]">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Why a blockchain, and not a database?</h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">
          <p>
            Because the adversary is whoever runs the database. Today every campus channel — forms, email, hotlines, vendor portals —
            is operated by the institution being reported. It can lose a report, backdate it, or say it never arrived.
          </p>
          <p>
            SAKSI needs three things no conventional system gives <em>against its own operator</em>: an append-only timestamp nobody
            can edit, verification by anyone without trusting us, and receipts that still verify if SAKSI disappears. The chain
            holds only hashes, IDs and timestamps — never content, never personal data.
          </p>
          <p className="text-xs text-muted">
            Running on {CHAIN_NAME}. The proposal targeted Lisk Sepolia, which was wound down in June 2026; the contract is
            chain-agnostic, so it runs unchanged on this OP Stack L2 testnet. Demo institutions and cases are fictional.
          </p>
        </div>
      </section>
    </div>
  );
}
