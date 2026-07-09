"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Chat" },
  { href: "/collections", label: "Collections" },
  { href: "/harness", label: "Harness" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-4">
      <span className="text-sm font-semibold tracking-tight text-black">rag-builder-mcp</span>
      <nav className="flex items-center gap-5">
        {NAV_LINKS.map((link) => {
          const isActive =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                isActive
                  ? "text-sm font-medium text-blue-600"
                  : "text-sm font-medium text-black/60 hover:text-black"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
