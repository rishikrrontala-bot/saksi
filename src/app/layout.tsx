import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { CHAIN_NAME, explorerAddress, REGISTRY_ADDRESS } from "@/lib/config";
import { NavLinks } from "@/components/NavLinks";
import { SealMark } from "@/components/SealMark";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAKSI — reports the institution can't bury",
  description:
    "Anonymous, tamper-evident misconduct reporting for campuses and teaching hospitals. Encrypted in your browser, anchored on a public chain.",
};

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
