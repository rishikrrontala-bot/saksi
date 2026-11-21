import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Outfit } from "next/font/google";
import Link from "next/link";
import { CHAIN_NAME, explorerAddress, REGISTRY_ADDRESS } from "@/lib/config";
import { NavLinks } from "@/components/NavLinks";
import { SealMark } from "@/components/SealMark";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAKSI · Reports the institution can't bury",
  description:
    "Anonymous, tamper-evident misconduct reporting for campuses and teaching hospitals. Encrypted in your browser, anchored on a public chain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${outfit.variable} ${jetbrains.variable} min-h-screen antialiased`}>
        {/* Floating glass pill navigation */}
        <header className="no-print sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
          <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-full border border-line/80 bg-paper/75 py-1.5 pl-2 pr-1.5 shadow-[0_12px_32px_-20px_rgba(20,22,27,0.35)] backdrop-blur-xl sm:gap-4 sm:pl-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full pr-1" aria-label="SAKSI home">
              <SealMark className="h-7 w-7" />
              <span className="hidden font-display text-lg font-semibold tracking-tight sm:inline">SAKSI</span>
            </Link>
            <NavLinks />
            <span className="ml-auto hidden items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs text-muted md:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-50 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
              </span>
              {CHAIN_NAME}
            </span>
          </div>
        </header>
        <main className="w-full max-w-full overflow-x-hidden">{children}</main>
        <footer className="no-print border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-10 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              SAKSI: <em>Saluran Aduan Kekerasan yang Sah &amp; Independen</em>. Built for COMPSPHERE 12.
            </p>
            {REGISTRY_ADDRESS && (
              <a className="font-mono hover:text-ink" href={explorerAddress(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
                Registry {REGISTRY_ADDRESS.slice(0, 10)}…{REGISTRY_ADDRESS.slice(-6)} ↗
              </a>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
