"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PROJECT_NAME } from "@/lib/project";

const NAV_LINKS = [
  { href: "/", label: "Chat" },
  { href: "/collections", label: "Collections" },
  { href: "/harness", label: "Harness" },
  { href: "/review", label: "Review" },
  { href: "/schema", label: "Schema" },
  { href: "/api-docs", label: "API Docs" },
];

export function Header({ testingSurfaceEnabled }: { testingSurfaceEnabled: boolean }) {
  const pathname = usePathname();
  const links = testingSurfaceEnabled ? NAV_LINKS : [];

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-white px-4">
      <span className="text-sm font-semibold tracking-tight text-black">{PROJECT_NAME}</span>
      <nav className="flex items-center gap-5">
        {links.map((link) => {
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
