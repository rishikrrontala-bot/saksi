"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/report", label: "Report" },
  { href: "/verify", label: "Verify" },
  { href: "/ledger", label: "Ledger" },
  { href: "/console", label: "Console" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-0.5 text-sm sm:ml-4 sm:gap-1">
      {LINKS.map((l) => {
        const active = path?.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2 py-1.5 font-medium transition-colors sm:px-3 ${
              active ? "bg-ink text-white" : "text-muted hover:bg-black/5 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
