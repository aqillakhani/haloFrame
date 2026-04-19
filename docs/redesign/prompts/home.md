# claude.ai/design prompt — Home screen

Paste the block below verbatim into claude.ai/design as your first message.

---

Design the **Home screen** for haloFrame, a mobile-first web app that helps grieving families turn photos into memorial tributes with AI — adding soft halos or angel wings to a loved one, or gently reuniting someone who's passed into a family group photo.

**Audience & tone.** Grieving adults, often first-time users in an emotionally vulnerable moment. Dignified and warm — not sentimental, not gimmicky, not "SaaS cheerful." No exclamation marks. No rocket ships or sparkles. No stock-photo smiles. Think editorial restraint: a museum's grief-support page, not a product marketing page.

**What the Home screen needs to do.**

1. Open on a single, calm hero that conveys purpose in under three seconds. Short headline, one-sentence subhead.
2. Present two primary paths as equal-weight cards: **Enhance a photo** (halo / wings / heavenly glow on an existing photo) and **Reunite with loved ones** (gently place someone who's passed into a family photo).
3. The app uses a fixed bottom tab bar (Home / My Tributes / Print Shop / Settings) — assume it's present below your screen, so do NOT duplicate those nav items inside Home.
4. Optional: a quiet, right-aligned badge showing "tributes remaining" for returning users. Unobtrusive. Users get 2 free lifetime tributes; paid tiers are Keepsake and Heritage.

**Visual direction — your call.** Start from the emotional brief above. Light mode only. Mobile-first (360px) and desktop (1440px). High-contrast accessible. Reduced-motion friendly. Use real portrait photography (royalty-free) for any imagery — no illustrated people. If you add motion, use it sparingly for arrival, not loops.

**Deliverable.** A standalone HTML export I can hand to Claude Code for React integration. Use semantic HTML and CSS variables for colors/spacing/typography so the tokens survive the port. No framework dependency — plain HTML + CSS + minimal vanilla JS if needed.

**Do not.** Pricing table on Home (that's on a separate paywall screen). Feature comparison chart. Testimonials. Email capture. "Get started in 60 seconds" copy. Purple/SaaS gradients. Icon soup. Headings that try to be clever.

---

## Usage notes (for Claude Code, not for claude.ai/design)

- When the user hands back the resulting HTML (or Claude Design handoff), port it into `.worktrees/redesign-v2/apps/web/src/screens/HomeScreen.tsx` on branch `redesign/v2`.
- Extract CSS variables into `apps/web/src/lib/tokens.ts` (create on first port — this commit seeds the design system).
- Preserve every invariant in `docs/plans/2026-04-18-redesign-contracts.md` for HomeScreen: brand mark label, two flow cards pushing to `ENHANCE_FLOW` / `REUNITE_FLOW`, no pricing on Home.
- Run `node scripts/smoke-redesign.mjs` before committing. Green = ship; red = revert.
- Commit to `redesign/v2`, not `main`. Main stays deployable until the whole branch merges at ship time.
