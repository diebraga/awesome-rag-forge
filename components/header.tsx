"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { PROJECT_NAME } from "@/lib/project";
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from "@/components/ui/menu";

const NAV_LINKS = [
  { href: "/", label: "Chat" },
  { href: "/collections", label: "Collections" },
  { href: "/harness", label: "Harness" },
  { href: "/review", label: "Review" },
  { href: "/schema", label: "Schema" },
  { href: "/portable-brain", label: "Portable" },
  { href: "/api-docs", label: "API Docs" },
];

export function Header({ testingSurfaceEnabled }: { testingSurfaceEnabled: boolean }) {
  const pathname = usePathname();
  const links = testingSurfaceEnabled ? NAV_LINKS : [];

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/10 bg-white px-4">
      <span className="text-sm font-semibold tracking-tight text-black">{PROJECT_NAME}</span>

      {links.length > 0 && (
        <>
          <nav className="hidden items-center gap-5 sm:flex">
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

          <Menu>
            <MenuTrigger aria-label="Open navigation menu" className="sm:hidden">
              <MenuIcon className="size-5" />
            </MenuTrigger>
            <MenuContent className="sm:hidden">
              {links.map((link) => {
                const isActive =
                  link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <MenuLinkItem
                    key={link.href}
                    render={<Link href={link.href} />}
                    className={isActive ? "text-blue-600 data-[highlighted]:text-blue-600" : undefined}
                  >
                    {link.label}
                  </MenuLinkItem>
                );
              })}
            </MenuContent>
          </Menu>
        </>
      )}
    </header>
  );
}
