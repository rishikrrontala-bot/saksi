import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { CHAIN_NAME, explorerAddress, REGISTRY_ADDRESS } from "@/lib/config";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAKSI — reports the institution can't bury",
  description:
    "Anonymous, tamper-evident misconduct reporting for campuses and teaching hospitals. Encrypted in your browser, anchored on a public chain.",
};

export function SealMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="18" fill="var(--color-seal)" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="white" strokeOpacity=".55" strokeWidth="1" strokeDasharray="2 2.2" />
      <path d="M25.5 14.2c-1.2-1.6-3.2-2.5-5.6-2.5-3.3 0-5.6 1.8-5.6 4.4 0 5.6 11.4 3.3 11.4 8.2 0 2.4-2.5 4-5.8 4-2.7 0-4.9-1.1-6-3" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} min-h-screen antialiased`}>
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <SealMark />
              <span className="font-display text-xl font-semibold tracking-tight">SAKSI</span>
            </Link>
            <NavLinks />
            <span className="ml-auto hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs text-muted md:inline-flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
              {CHAIN_NAME}
            </span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-20 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              SAKSI — <em>Saluran Aduan Kekerasan yang Sah &amp; Independen</em>. Built for COMPSPHERE 12.
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
