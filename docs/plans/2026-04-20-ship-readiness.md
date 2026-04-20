# Ship-readiness audit — redesign/v2 → main

> Entry point for the post-port phase. All 8 screens are on `redesign/v2` as of commit `1822f72`. This doc is the gate-by-gate checklist to merge that branch into `main`. Read memory `project_redesign_v2.md` first for context.

## State entering the audit

| Axis | Value |
|---|---|
| `main` tip | `b68cc1d` (MyTributes prompt) |
| `redesign/v2` tip | `1822f72` (MyTributes port) |
| redesign commits ahead of main | 8 (one per screen) |
| `scripts/smoke-redesign.mjs` | 5/5 green |
| `npm --workspace=@haloframe/web run typecheck` | clean |
| `npm --workspace=@haloframe/api run typecheck` | 15 errors in `src/routes/tribute.ts` (pre-existing, known) |
| secrets scan | not yet run |
| full-app eyeball across 8 screens | done per-screen during port, not yet in one pass |
| `audit` skill pass | not yet run |

## Files in main's working tree that aren't committed

`git status` on main currently shows:
- `design/` (design handoffs + screenshots — not in `.gitignore`)
- `scripts/extract-design-template.mjs` + `scripts/extract-design-assets.mjs` (working tooling used during the port)
- `docs/redesign/prompts/{editor,enhance-flow,paywall,print-shop,reunite-flow,settings}.md` (six intermediate prompts; Home + MyTributes are already committed)

These are not blocking ship. Decision for the next session: commit as a single "redesign archive" commit on main, or add `design/` to `.gitignore` and only commit the scripts + prompts. Default recommendation: commit everything — the prompts + scripts are small and useful; the HTML handoffs + screenshots are bulky but they're the canonical reference for any future design-system work.

## Blocking gates (run in order)

### Gate 1 — fix `apps/api/src/routes/tribute.ts`

**Why it blocks:** workspace-wide `npm run typecheck` fails on api even though the router is only mounted when `SPIKE_MODE=false` (dev + smoke both default to `SPIKE_MODE=true` and never hit this router). Ship-cleanliness requires `tsc --noEmit` green everywhere.

**The errors:** 15× `TS2322` / `TS2345` — Express's `req.query.x` is typed as `string | string[]` and the route handlers assign or pass it to a `string`-typed field without narrowing.

**Fix pattern:** at each error site, coerce once:
```ts
const val = Array.isArray(req.query.x) ? req.query.x[0] : req.query.x;
```
…then use `val`. Or a shared helper at top of file:
```ts
const q = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined;
```
Then `q(req.query.x)` where a string is expected.

**Do this on `main`**, not on `redesign/v2`. Commit message:
```
fix(api): narrow req.query string|string[] in tribute routes

Pre-existing TS errors that surfaced during redesign/v2 ship-readiness
audit. Router is only mounted when SPIKE_MODE=false (not the dev
default), so dev and smoke were unaffected, but workspace typecheck
fails. Narrow each req.query access at the call site.
```

**Verification:** `npm --workspace=@haloframe/api run typecheck` exits clean.

### Gate 2 — rebase `redesign/v2` onto main

After Gate 1 lands on main:
```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame/.worktrees/redesign-v2
git fetch origin
git rebase main
```
Expected: clean rebase. Redesign touched only `apps/web/**` + `docs/plans/2026-04-18-redesign-contracts.md`; the Gate 1 fix touches only `apps/api/src/routes/tribute.ts`. No overlap, no conflicts.

If any conflict appears: stop and investigate. Conflicts here mean something unexpected changed on main.

### Gate 3 — full-app eyeball

Launch dev server on `:5200` and walk all 8 screens at **390×844 (mobile)** + **1440×900 (desktop)**. Each screen has documented states in the contracts doc; the eyeball pass only needs the default state per screen (the per-state captures already live in `design/screenshots/`).

Flow (drives real user paths, not direct tab jumps):
1. Home → tap "Give them a halo" → EnhanceFlow upload
2. Back → tap "Reunite with someone" → ReuniteFlow upload
3. Back → Settings tab → Paywall CTA → back
4. Tributes tab → MyTributes empty
5. Prints tab → PrintShop browsing
6. Back to EnhanceFlow → full flow through to Editor (mocked uploads are fine)

Store captures in `design/screenshots/ship-audit/{screen}-{viewport}.png`. If any visual regression vs `design/screenshots/{screen}-*.png` (per-screen reference), flag it before merge — don't silently fix during audit.

### Gate 4 — secrets scan

```bash
git grep -nE "SUPABASE_SERVICE_ROLE|SUPABASE_ANON|FAL_KEY|STRIPE_SECRET|sk_live_|sk_test_" -- ':!**/*.md' ':!**/*.mdc' ':!docs/**'
```
Expected: zero hits outside `.env.example` templates. Any real secret → rotate + scrub before merge (do not amend; create a follow-up commit).

Also check `.env*` files aren't tracked:
```bash
git ls-files | grep -E "\.env$|\.env\."
```

### Gate 5 — audit skill pass

Run the `audit` skill over the redesigned `apps/web/src/**`. The skill covers: P0/P1 correctness bugs, a11y, error-handling gaps, insecure patterns. Ship-blocker is P0 or P1; P2/P3 go into a follow-up issue list.

### Gate 6 — final smoke + typecheck

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame/.worktrees/redesign-v2
node scripts/smoke-redesign.mjs    # 5/5 green
npm run typecheck                  # root: all workspaces clean
```

## Merge

**Non-fast-forward not acceptable.** The per-screen commit history is load-bearing — use `--ff-only` to preserve it:
```bash
# on main-checkout (not the worktree):
git checkout main
git pull --ff-only origin main
git merge --ff-only redesign/v2
git push origin main
```

If `--ff-only` refuses (main moved after Gate 2), repeat Gate 2 rebase and try again.

## Post-merge (not ship-critical, do later)

These are follow-ups, not gates:
- Delete dead components `apps/web/src/components/UploadZone.tsx` + `apps/web/src/components/LoadingOverlay.tsx` (zero callers after EnhanceFlow/ReuniteFlow re-ports)
- Motion polish pass — see `memory/project_next_design_pass.md` for the 3–5 moments
- Commit or `.gitignore` the `design/` tree on main (see "Files in main's working tree" above)
- Clean up the 6 untracked prompts on main with a single commit

## Failure modes to watch

- **"Tribute.ts narrows break a real shape."** These route handlers existed before redesign. If narrowing a `string | string[]` to `string[0]` changes semantics (e.g., the route used to accept multi-value queries), the fix is *both* narrowing + explicit error on the array case. Read each route before blindly coercing.
- **Rebase conflict in a file redesign didn't touch.** Means main moved beyond just Gate 1. Stop and re-read the main log.
- **Dev server port 5200 in use.** A prior session may have left Vite running. Kill it: check `TaskList` for any `vite` background task and stop via `TaskStop`, or `lsof -iTCP:5200 -sTCP:LISTEN` on the shell.
- **Smoke fails during audit.** Smoke is infrastructure-level, not redesign-level. If smoke breaks between now and audit, the supabase/api layer regressed — investigate there, not in web.

## Known non-blockers (do not re-raise)

- `tribute.ts` TS errors — fixed in Gate 1
- `UploadZone` + `LoadingOverlay` dead code — post-merge cleanup, optional
- Motion polish — a whole separate plan, not in this audit
- Untracked files in main's working tree — a clean-up decision, not a merge blocker
