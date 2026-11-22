import Link from "next/link";
import { CHAIN_NAME } from "@/lib/config";
import { ChainMarquee, HeroEnvelope, LiveRegistryCard, Reveal, ScrollProgress, ScrubText, StackedShots, StepsAccordion } from "@/components/home/HomeClient";
import { WaxSeal } from "@/components/brand";

const FACTS = [
  {
    n: "2,621",
    t: "bullying reports reached the Health Ministry's residency channel by 30 March 2025. 620 were confirmed as bullying.",
    src: "IDN Times, 22 Apr 2025",
    href: "https://www.idntimes.com/news/indonesia/kemenkes-catat-2-621-laporan-bullying-selama-2025-00-xvwcc-wk7vzh",
  },
  {
    n: "63%",
    t: "of lecturers who knew of sexual violence on their campus did not report it.",
    src: "Kemendikbud survey 2020, via CNN Indonesia",
    href: "https://www.cnnindonesia.com/nasional/20211111093436-20-719583/survei-nadiem-77-persen-dosen-akui-ada-kekerasan-seksual-di-kampus",
  },
  {
    n: "4,303",
    t: "campuses must run a reporting task force under Permendikbudristek 55/2024. None can prove it received a report.",
    src: "Kemdiktisaintek, Statistik PT 2025",
    href: "https://kemdiktisaintek.go.id/library/book/statistik-pendidikan-tinggi-2025",
  },
];

const WHY =
  "Because the adversary is whoever runs the database. Today every campus channel, from forms and email to hotlines and vendor portals, is operated by the institution being reported. It can lose a report, backdate it, or say it never arrived. SAKSI puts only a fingerprint and a timestamp on a public chain, where nobody can edit them, anyone can check them, and they still verify if SAKSI disappears.";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      {/* Attention */}
      <section className="relative mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-8 sm:pt-28 lg:min-h-[86vh] lg:pb-56">
        <Reveal>
          <h1 className="max-w-6xl font-display text-[clamp(3rem,6.2vw,6rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
            Reports the institution <span className="text-seal">can&apos;t bury.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            Anonymous misconduct reporting for campuses and teaching hospitals. Sealed in your browser, anchored on a public chain, and
            answered on the record.
          </p>
        </Reveal>
        <Reveal delay={0.2} className="mt-10 flex flex-wrap gap-3">
          <Link href="/report" className="btn-seal px-7 py-3.5 text-base">
            File a sealed report
          </Link>
          <Link href="/verify" className="btn-ghost px-7 py-3.5 text-base">
            Check a receipt
          </Link>
        </Reveal>
        <div className="mt-16 lg:mt-0">
          <HeroEnvelope />
        </div>
      </section>

      {/* Interest: live chain activity, then the case for it */}
      <ChainMarquee />

      <section className="mx-auto max-w-7xl px-4 py-32 sm:px-8 md:py-48">
        <h2 className="max-w-5xl font-display text-[clamp(2.2rem,4.4vw,4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
          Sealed in your
          <span
            aria-hidden
            className="mx-3 inline-block h-[0.82em] w-[2.4em] translate-y-[0.08em] rounded-full border border-line bg-cover bg-[position:22%_18%] align-baseline shadow-sm"
            style={{ backgroundImage: "url(/shots/receipt.jpg)" }}
          />
          browser. Answered where nobody can edit it.
        </h2>
        <div className="mt-16 grid grid-flow-dense grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2 md:row-span-2">
            <LiveRegistryCard />
          </div>
          {FACTS.map((f, i) => (
            <figure
              key={f.n}
              className={`group flex flex-col justify-between rounded-[28px] border border-line bg-card p-7 transition-[border-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-ink/30 ${
                i === 0 ? "md:col-span-2" : "md:col-span-1"
              }`}
            >
              <p className="font-display text-6xl font-semibold tracking-tight text-seal">{f.n}</p>
              <figcaption className="mt-6">
                <p className="text-[15px] leading-relaxed text-ink-2">{f.t}</p>
                <a href={f.href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-muted underline underline-offset-4 hover:text-ink">
                  {f.src} ↗
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Desire: how it works, the product, why a chain */}
      <section className="mx-auto max-w-7xl px-4 pb-32 sm:px-8 md:pb-48">
        <h2 className="mb-12 max-w-4xl font-display text-[clamp(2.2rem,4.4vw,4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
          Four steps, one record.
        </h2>
        <StepsAccordion />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-32 sm:px-8 md:pb-48">
        <h2 className="mb-14 max-w-4xl font-display text-[clamp(2.2rem,4.4vw,4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
          Live on {CHAIN_NAME}, not a mockup.
        </h2>
        <StackedShots />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-32 sm:px-8 md:pb-48">
        <h2 className="font-display text-[clamp(2.2rem,4.4vw,4rem)] font-semibold leading-[1.05] tracking-[-0.02em]">
          Why a blockchain, and not a database?
        </h2>
        <ScrubText text={WHY} className="mt-10 font-display text-[clamp(1.5rem,2.6vw,2.4rem)] leading-[1.3] tracking-[-0.01em] text-ink" />
        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-muted">
          Running on {CHAIN_NAME}. The proposal targeted Lisk Sepolia, which was wound down in June 2026. The contract is chain-agnostic,
          so it runs unchanged on this OP Stack L2 testnet. Demo institutions and cases are fictional.
        </p>
      </section>

      {/* Action */}
      <section className="px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="relative overflow-hidden rounded-[36px] bg-forest px-6 py-28 text-paper sm:px-16 md:py-40">
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-seal/30 blur-[120px]" />
          <WaxSeal className="absolute -bottom-8 right-6 hidden w-44 rotate-[8deg] md:block lg:right-16 lg:w-56" />
          <h2 className="relative max-w-5xl font-display text-[clamp(2.6rem,6vw,5.6rem)] font-semibold leading-[1] tracking-[-0.03em]">
            A report deserves a record. <span className="text-[#ff8f80]">Keep yours.</span>
          </h2>
          <div className="relative mt-12 flex flex-wrap gap-3">
            <Link href="/report" className="btn bg-paper px-7 py-3.5 text-base text-ink hover:bg-white">
              File a sealed report
            </Link>
            <Link href="/ledger" className="btn border border-paper/30 px-7 py-3.5 text-base text-paper hover:border-paper/70">
              See the public ledger
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
