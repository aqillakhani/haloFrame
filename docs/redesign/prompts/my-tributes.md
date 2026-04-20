# claude.ai/design prompt — MyTributes

Paste the block below verbatim into claude.ai/design as your first message. **Use a fresh session** (don't continue from Home / Settings / Paywall / EnhanceFlow / ReuniteFlow / Editor / PrintShop).

---

Design the **MyTributes** screen for haloFrame, a mobile-first web app that helps grieving families turn photos into memorial tributes with AI. This is the **eighth and final** screen in a multi-screen redesign — Home, Settings, Paywall, EnhanceFlow, ReuniteFlow, Editor, and PrintShop are already designed. Match the house style.

**Context.** MyTributes is the user's **memorial gallery** — the place they come back to when they want to revisit a tribute, share it, or order a canvas of it. It's reached from the second bottom-tab ("My Tributes"). Right now most users will land here with zero tributes saved; over time, they'll return with several. This is a quiet gallery, not a feed — no likes, no shares-count, no "latest activity" timeline.

**Scope.** Design **two states** in the mockup: `empty` (no tributes yet, the MVP default) and `populated` (3–5 saved tributes, the future state once the listing backend ships). Both states are intentionally sparse — this is a room that wants to feel peaceful even when full.

**House style — carry forward from the seven prior screens.** Light mode only. Mobile-first (360 / 390) with a desktop variant (1440). Reduced-motion friendly.

- **Palette:** warm cream page (`#FAF3E2`), card surface (`#FFFBF0`), sunk surface (`#F4ECD9`), deep ink (`#2A231B`), soft ink (`#5E5146`), mute ink (`#8A7E6E`), deep terracotta accent (`#A0503C`) with `#7A3A27` hover, dusk plum (`#6F5179`), warm halo gold (`#D4A95C`) with `#EFD9A6` soft, rule `#DCD0BD`, rule-strong `#C9BBA3`, rose `#C48A7E` for gentle errors.
- **Type:** Source Serif 4 for display (300 italic for accent words), Inter Tight for body, ui-monospace for eyebrows at 10.5px with 0.14em tracking + uppercase.
- **Shape vocabulary:** 22px card radius, 14px button radius, 1px rule dividers, 2px terracotta outline-offset focus rings, gold hand-drawn underline under italic accent words, gold-L corner marks on framed photos (use these on every tribute card — this is the frame language of the whole app).
- **Motion policy:** arrival `rise` (opacity + 4px translateY, staggered). Tributes cascade in with 60ms stagger. No progress bars, no spinners. No pulsing hearts or animated "new tribute" badges.
- **Tone:** reverent, not retail. "Your gallery" not "Your collection". "Remembered" not "Saved". No counts-as-achievement language ("You've made 3 tributes!"). No gamification. No emoji.

**What the screen needs to do.**

Open in `empty` state by default; `populated` is demoed via a mockup tweak (see the Tweaks panel). Let the user see their saved tributes at a glance, tap one to revisit, and — when empty — feel invited rather than prodded.

### Chrome (both states)

- **No back button** — this is a tab destination, reached from the bottom tab bar. The app shell renders the tab bar outside the screen.
- **Screen header:** italic-split serif title. *"Your **gallery**."* (italic gold-underlined accent on **gallery**, trailing period load-bearing like the other title moments in the app). A plum-tinted mono eyebrow above the title — "TAB TWO" or "MEMORIAL GALLERY".
- **Subhead (short italic serif):** *"Every tribute you've made lives here, waiting quietly."* Use this in both states — it reads warm in the empty view and grounding in the populated view.
- No credit badge. No search box. No filter chips. No sort dropdown. Gallery remains chronological (newest first), without surfacing any of that as UI.

### Empty state (the MVP port target)

A quiet, inviting viewing room with no paintings hung yet. Design:

- **A ghosted "empty frame" vignette** centered on the page — a 22px-radius card with the gold-L corner marks, rule border, and a soft cream-to-sunk gradient fill (no photo). Dimensions roughly 240×320 on mobile, larger on desktop. Inside the frame, a faint halo glyph at ~30% opacity — enough to suggest what the frame is waiting to hold, not enough to feel like a placeholder image.
- **Under the frame:** a short italic serif message — *"Your first tribute will arrive here."* (40px on mobile, 48px desktop).
- **A quiet body paragraph (1–2 lines, ink-soft):** "When you remember someone with a halo or a reunion, their photo will rest in this gallery. We'll keep them here for you."
- **Primary CTA:** terracotta pill — *"Create a tribute"* — routes to the Home tab. (Copy change from the old "Create Your First Tribute" — new copy is less first-timer-ish.)
- **Optional secondary ghost button:** *"See how it works"* — links back to Home. Treat as a bonus, not required.
- A single gold hairline + small dot ornament (Saved-modal language) sits below the CTA, closing the composition.

Motion: the frame fades in first, then the message, then body, then CTA. Reduced-motion users get static rendering.

### Populated state (the future-port mockup)

Demo 3–5 saved tributes in a gallery grid:

- **Quiet count line** above the grid — italic serif, *"Three tributes remembered."* (singular "tribute" if one). This replaces any "X items" count from a typical gallery.
- **Grid:** 2 columns on mobile, 3 columns on tablet (≥600), 4 columns on desktop (≥1024). 16–20px gap. Each tile is a **framed tribute card** that reads like a wall frame, not a thumbnail tile.
- **Each tribute card:**
  - Cream card, 1px rule border, 22px radius, 16px inner padding.
  - **Framed tribute photo** at the top — 1:1 or 4:5 aspect ratio, with gold-L corner marks (same language as Editor / PrintShop) and a subtle inner rule.
  - **Tiny mono-caps eyebrow** below the photo — one of: `HALO`, `REUNION`, `CANVAS ORDERED` (the last shown only when the user has ordered a canvas of this tribute).
  - **Date line** in italic serif — *"February 14, 2026"*, not "2/14/26" or "3 days ago". No relative time.
  - **Name or caption line** (optional) — if the user gave the tribute a name, show it in body-sm ink-soft. For the mockup, alternate between "Mom" / "Grandpa Joseph" / "Our Lucy" to show range (single name, full name, pet). If no name, omit the line — don't render "Untitled".
  - **Hover / focus state on desktop:** card lifts 2px, rule warms to rule-strong, gold-L corners glow very slightly. On touch, no hover — tap goes straight to the lightbox.
- **Tap behavior:** opens a **lightbox overlay** with the tribute full-screen, plus three quiet actions at the bottom:
  - Ghost button *"Edit again"* — opens the tribute in Editor with the original source + styled variant.
  - Terracotta primary *"Order a canvas"* — routes to PrintShop with this tribute preselected.
  - Ghost *"Download"* — saves the PNG to the user's device.
- **Lightbox chrome:** close X top-right (36×36, same language as Saved / coming-soon modals), Esc closes, backdrop click closes, focus trap, primary CTA gets initial focus. Share language with the other app modals (gold hairline + dot ornament at the top).
- No delete button on tributes in this design — tribute removal is out of MVP scope and will come from Settings later (a single "clear my tributes" destructive pill on Settings, not a per-card trash icon).
- No drag-to-reorder. No "pin to top". No folders. No tags. No filters by type (halo vs reunion). The gallery is a flat chronological stream.

### Bottom of populated state

- A quiet gold hairline divider.
- One italic serif line: *"Your gallery grows with every tribute."*
- No "Create a tribute" CTA on the populated view — the bottom tab bar already offers Home as the entry point; a second CTA here would compete with it.

### Tweaks panel (for your mockup only)

Let the mockup expose:
- A `data-state` attribute with values `empty` / `populated` — so both designs show up in one file.
- A `populated` count toggle (3 / 4 / 5 tributes) — so the grid density can be inspected.
- A desktop / mobile viewport toggle.
- A lightbox-open toggle (only for `populated` state) — to show the tap-to-view lightbox design.

### Accessibility

- Main heading uses a single `<h1>`. Tribute cards are `<li>` inside a `<ul role="list">`. Lightbox is a `<div role="dialog" aria-modal="true" aria-labelledby>`.
- Every CTA gets a 2px terracotta outline-offset focus ring.
- Date lines include an `aria-label` expanding the date (`aria-label="February fourteenth, two thousand twenty six"` is overkill — stick to `aria-label="February 14, 2026"` if the visual is already written out).
- The empty-state CTA has `aria-label="Create your first tribute"` so screen readers get the invitation even if the visual trims the "first".

**Do not.**

- Don't add a search box, filter chips, sort dropdown, or "view as list / grid" toggle.
- Don't add timestamps like "3 days ago", "Last week", or activity feeds.
- Don't add share counts, heart counts, or any social metric.
- Don't add a "New tribute" banner inside the populated view — the bottom tab bar is the entry point.
- Don't add per-card trash / delete buttons.
- Don't add a "Published" / "Draft" status badge. All saved tributes are final.
- Don't add achievement badges ("First tribute!", "One month anniversary!") or any gamified progress.
- Don't add emoji. Don't use heart icons. Don't add confetti.
- Don't duplicate the bottom tab bar — the app shell renders it outside the flow.

**Deliverable.** A standalone HTML export. Include a `data-state` attribute on `<body>` or the root div — toggling it should swap between `empty`, `populated`, and `populated-lightbox-open`. Use semantic HTML (`<main>`, `<section>`, `<h1>`, `<ul role="list">` + `<li>`, `<button>` for CTAs, `<dialog>` or `role="dialog"` for the lightbox). CSS custom properties for any new tokens. Inline React or plain HTML + CSS both fine. Semantic date-machine strings in `<time datetime="2026-02-14">` welcome.

---

## Usage notes (for Claude Code, not for claude.ai/design)

- When the user hands back the HTML, port **only the `empty` state** into `.worktrees/redesign-v2/apps/web/src/screens/MyTributesScreen.tsx` on branch `redesign/v2`. The populated-state mockup is a future-port reference; archive the HTML at `design/MyTributes.standalone.html` so the future feature sprint can use it as the visual baseline.
- Preserve the existing contract from `docs/plans/2026-04-18-redesign-contracts.md` for MyTributesScreen:
  - `useNavigation()` + `useReducedMotion()` hooks stay.
  - Primary CTA fires `nav.setTab('HOME')`.
  - `HaloIllustration` component may still be used for the ghost-frame center glyph — or swap for a dedicated `FrameGhost` illustration if the design calls for it. Either way, keep the component in `components/illustrations/`.
- Add copy keys under `COPY.myTributes.*`: `eyebrow`, italic-split `headingBefore|Italic|After`, `subhead`, `emptyTitleBefore|Italic|After`, `emptyBody`, `emptyCta`, `emptySecondaryCta` (if used). Drop the old `emptyHeading` + `emptySubtext` + `emptyCta` or keep them as aliases — your call; don't leave both sets wired.
- New tokens should be rare. The ghost-frame vignette composes from `surface.card` + `surface.sunk` + `halo.goldSoft` + existing rule tokens. Don't add a `gallery.*` token group unless the design genuinely requires it.
- Port the populated-state **structure** as hidden-by-default JSX guarded by a boolean (`hasTributes = false` constant for now) — that way the future backend wiring is a single swap, not a rewrite. But **don't** build the listing hook, the lightbox focus-trap, or the download button in this port. Stubs are fine; placeholder data is not wired up.
- Run `node scripts/smoke-redesign.mjs` before committing. Green = ship; red = revert.
- Eyeball the empty state via Playwright MCP — no fetch mocks needed. Also do a desktop + mobile viewport check. Don't bother screenshotting the populated-state stub if it's hidden behind `hasTributes=false`; the design HTML is the reference.
- Commit to `redesign/v2`, not `main`. This is the **final screen** — after this commit, the next session's job is the ship-readiness audit (smoke + typecheck + secrets scan + mobile/desktop eyeball across all 8 screens) and the merge to main.
