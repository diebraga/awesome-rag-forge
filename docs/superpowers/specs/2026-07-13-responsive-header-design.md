# Responsive header nav

## Context

`components/header.tsx` grew to 6 nav links (Chat, Collections, Harness, Review, Schema, API Docs) over this session and had no responsive handling — a plain flex row that wraps/breaks on narrow viewports.

## Decision

No shadcn MCP tool is available in this environment, so the component choice was made directly from the project's own installed stack: `@base-ui/react` is already a dependency and already the headless engine behind every existing `components/ui/*.tsx` wrapper (avatar, button, input, scroll-area, separator). It ships `menu`, `drawer`, and `navigation-menu` primitives — no new dependency needed.

- **`sm:` and above**: unchanged inline flex nav, exactly as before.
- **Below `sm`**: the inline nav is hidden (`hidden sm:flex`) and replaced by a hamburger `MenuTrigger` button (`sm:hidden`) opening a `@base-ui/react` `Menu` listing the same links vertically, using `Menu.LinkItem` with `render={<Link href={...} />}` so navigation goes through Next.js's router, and `closeOnClick` so the menu dismisses after choosing a link.
- New `components/ui/menu.tsx` wraps the primitive following this project's existing shadcn-style convention (`data-slot` attributes, `cn()` class merging, matching `button.tsx`'s pattern).

## Verification

tsc clean (validates the `render`/`LinkItem` API usage against real base-ui types), lint clean, 103/103 tests, clean production build. SSR markup fetched directly from the running dev server confirms both responsive states render with the correct Tailwind classes (`hidden ... sm:flex` on the desktop nav, `sm:hidden` on the trigger) — pure CSS media queries, not JS-driven, so the breakpoint behavior is Tailwind's own well-tested compile output. No project-managed browser session was available to visually screenshot both widths (the user's own `next dev` was running independently on port 3000, outside this session's preview tooling) — verification relied on markup + type-correctness instead.
