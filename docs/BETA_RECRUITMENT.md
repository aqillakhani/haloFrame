# haloFrame — Beta Recruitment Kit

Google Play's **Closed Testing rule for new developer accounts** is the
single biggest schedule risk for this launch. The rule (research §2.5):

> A new developer account must have **at least 12 testers** opted in
> to a Closed Testing track for **14 consecutive days** before the
> production track unlocks. Testers must actually open the app at
> least once during the window. Skipping or shortening the 14 days is
> not negotiable.

This doc is the kit you run on **Day 0** (Sat 2026-04-25) so the clock
starts ticking on time.

---

## 1. The math

| Metric | Target | Why |
| --- | --- | --- |
| DMs sent | **18** | 15-30% reply-no or ghost — buffer |
| Yes responses | **15+** | 2-3 will install but never open the app |
| Active testers in 14-day window | **12** | Play Console threshold |
| Active = | "Opened the app at least once between Day 14 and Day 28" | Per Play's tester-engagement rule |
| Buffer recruiters | **3 standby** (Reddit/Facebook/Discord) | If yeses are <12 on Day 5, you fire these |

If you hit 18 sends and 15+ yeses on Day 0, you have ~80% odds of
clearing the threshold without a Day-10 escalation.

---

## 2. The pitch

The entire DM is one paragraph + one ask. Friendly, specific, names
the value.

### DM template — primary (350 chars)

> Copy / paste / personalize the first sentence per recipient.

```
Hey {{NAME}} — I'm shipping a memorial photo app, haloFrame. It
adds a loved one back into a family photo, or restores an old
faded one. To launch on Google Play I need 12 testers for two
weeks. Lifetime Heritage tier ($24.99/mo retail) for anyone who
sticks the window. Want in?
```

### DM template — for distant contacts (380 chars)

> Use when the recipient might not remember you well.

```
Hey {{NAME}}, hope you're well. Aqil here — we worked together at
{{SHARED_CONTEXT}}. I'm launching a memorial photo app called
haloFrame; it reunites loved ones in a family photo or restores
old ones. Need 12 Android testers for the Play Store launch. Free
Heritage tier (~$300/yr) if you're in for a 2-week test. Worth a
look?
```

### What NOT to write

| Phrase | Why |
| --- | --- |
| "It uses AI to bring back deceased family" | Marketing-voice rule from STORE_LISTINGS.md — "bring back" is a rejection trigger; also feels gross to recipients |
| "Resurrect your grandmother" | Same |
| "Deepfake" | Both stores reject memorial-AI apps that lead with this |
| "Just need 5 minutes of your time" | Over-promises and under-delivers; the 14-day rule is the actual ask |
| Long paragraphs | DMs over 400 chars get skimmed and ignored |

---

## 3. Where to recruit

Go in this order. Stop when you have 18 sends + 15 yeses.

### Tier 1 — Highest yield (target 12 of 18)
- **Family group chats.** WhatsApp / iMessage / Signal. Specifically
  the "actually responds to texts" subset of your family.
- **Personal friend group chats.** Same logic — people who already
  message you weekly.

### Tier 2 — Backup (target 4 of 18)
- **Direct DMs to friends with Android phones.** Filter by Android
  ownership — Pixel/Samsung/OnePlus people. iPhone-only friends are
  TestFlight-only and can't help you here.
- **LinkedIn DMs to former coworkers** who you know own Android. One
  reply per workplace is plenty; don't spam.

### Tier 3 — Standby pool (target 2 of 18; activate on Day 5 if short)
- **r/genealogy** — Reddit. Don't post a recruit ad; instead reply
  helpfully on a few threads, then DM the OPs you helped. Mods are
  fine with low-volume DMs but will ban "I'm launching an app" posts.
- **Facebook memorial groups** (e.g. "Remembering Loved Ones",
  "Family Photo Restorers"). Same rule: be a member first, message
  privately second.
- **Discord servers in the photo / family-history hobby space**
  ("Photo Restoration Society", "Family Tree Builders"). Read the
  rules before DMing — most ban unsolicited promotional DMs.

### Tier 3 throttle
Don't burn your standby pool unless Day 5 yeses are <10. Friends and
family install rate beats stranger install rate by ~3x; over-recruiting
strangers risks getting <12 actives because they bail at the install
step.

---

## 4. The incentive

**Lifetime Heritage tier.** $24.99/mo retail × 12 months = ~$300/year
of value, given for free, forever. Frame it that way in the DM.

Rules:
- Award only after Play Console confirms the tester was active during
  the 14-day window.
- Implementation: `scripts/topup-user.mjs` with a 100-credit grant +
  set `plan_id = 'heritage_monthly'` + `renews_on = null` (no expiry).
  Or use `grant_credits(p_action: 'manual_adjustment')` directly.
- Document each grant in `docs/BETA_TESTERS.txt` (gitignored) for tax
  records.

If a tester complains: "I tested, where's my Heritage?" — reply within
24 hours and re-confirm Play activity. The lifetime grant is your
credibility with future test cycles.

### Alternative incentive (don't promise both)

- **$50 Amazon gift card** if Heritage isn't appealing to a specific
  recipient (some friends won't use a memorial app even free). Pick
  one or the other per person, never both.
- Cost: $50 × 12 testers = $600. About the same dollar cost as
  Heritage; cleaner accounting.
- Trade: gift cards turn the recruit transaction into something more
  obviously commercial. Heritage feels like a thank-you.

---

## 5. Day-by-day execution

### Day 0 — Sat 2026-04-25 — send 18 DMs
- Time budget: 90 minutes.
- Use the §2 DM template; personalize each.
- Track in a spreadsheet or `docs/BETA_TESTERS.txt`:
  - Name
  - Channel (Whatsapp / iMessage / LinkedIn / etc.)
  - Sent date
  - Reply status (yes / maybe / no / ghost)
  - Has Android device? (you'll only know after they reply)
  - Email for Play Console invite

### Day 1 — Sun 2026-04-26 — confirm 8-12 yeses
- Reply to every yes within 4 hours with: "Amazing, thank you. I'll
  send the Play Store invite around May 9 — it'll be a single tap to
  install once you're added to the list."
- For maybes / non-replies: do NOT follow up. Wait until Day 3.

### Day 3 — Tue 2026-04-28 — first follow-up
- Friendly bump to non-replies: "Hey, did this land in your inbox?
  No worries either way — short window."
- Goal: convert 2-3 ghosts into yeses.

### Day 5 — Thu 2026-04-30 — count + activate Tier 3 if needed
- If yeses ≥ 12: STOP recruiting. Save your remaining DM budget for
  Day-10 reminders.
- If yeses 10-11: send 5 more Tier 1/2 DMs.
- If yeses ≤ 9: activate Tier 3 (Reddit/Facebook/Discord). See §3.

### Day 5 reminder DM — for confirmed yeses

```
Quick heads up — Play Store invite goes out around May 9 (eight
days). The test is just: install, open the app once a week,
generate one tribute. Total time ~20 min over 2 weeks. Drop a
👍 if you're still in.
```

### Day 10 — Tue 2026-05-05 — second reminder + escalate if short
- For confirmed yeses: bump those who didn't 👍 the Day 5 reminder.
- If active commitment count < 12: hard escalate
  - Post in 1 (one) memorial-themed Facebook group (read group rules first)
  - Ask each of your 3 closest friends to DM 1 person each
  - Last-resort: post on r/SideProject "Closed beta tester swap" thread
- Goal: lock 14+ committed by Day 13.

### Day 10 reminder DM

```
Final stretch — invite goes out Saturday. Once you accept on
Google Play it'll auto-install. Open it once that week, generate
one tribute, and you're done — Lifetime Heritage on me. Thanks
for sticking with me.
```

### Day 13 — Fri 2026-05-08 — final pre-flight
- Confirm 12-15 firm yeses with email captured.
- Create the Google Group `haloframe-beta@googlegroups.com`; invite
  all 12-15 emails.
- Add the group as a tester audience in Play Console → Testing →
  Closed Testing.

### Day 14 — Sat 2026-05-09 — submit + invite
- Promote the AAB from Internal Testing to Closed Testing.
- Play Console emails the test list automatically (the Google Group
  members each get a one-tap install invite).
- Send your own personal heads-up DM to all 12-15 (next subsection).

### Day 14 invite-day DM

```
🎉 The invite is out! Check your email for "haloFrame Beta is
ready" from Google Play. One tap → installs. After install, just
open it, sign up with whatever email is easiest, and try one
Reunite or one Enhance. That's the whole test.

Any bugs / weirdness — reply here or use the in-app Report
button. Thanks again, this means a lot.
```

### Day 15 — Sun 2026-05-10 — confirm installs
- Play Console → Testing → Closed Testing → Engagement reports →
  count installs.
- Goal: ≥ 12 installs by EOD Day 15.
- If < 12: bump the slowpokes via DM.

### Day 16-20 — passive monitoring
- Don't bug testers daily. They're not employees.
- Check the Engagement report every 2 days. If a tester hasn't
  opened the app by Day 18, send ONE more DM:

```
Hey — saw you haven't opened haloFrame yet. The 14-day window
needs at least one open per tester or Play makes me restart the
clock. Could you open it once today? It's a single tap.
```

### Day 21 — Sat 2026-05-16 — mid-window check
- Engagement report should show 12+ openers and 8+ generators.
- If NOT: write to Play Console support; ask whether the current
  cohort qualifies as "active" or whether you need to extend.

### Day 27 — Fri 2026-05-22 — pre-promotion verification
- Engagement report final read: 12+ active confirmed.
- All testers thanked individually (template below).
- Heritage tier granted to all 12 active testers (use
  `scripts/topup-user.mjs` per §4).

### Day 28 — Sat 2026-05-23 — promote to production
- Play Console → Production → New release → "Promote" from Closed
  Testing.

### Day 27 thank-you DM

```
🙏 Closed beta is wrapping. Couldn't have submitted without you.
Your Lifetime Heritage tier just landed on the account you used —
sign in at gethaloframe.com to verify.

If anyone you know would benefit from it, the Play Store goes
live ~June 1. Word of mouth is the entire launch plan, so even
one share moves the needle. Thanks again.
```

---

## 6. Escalation playbook — < 12 active by Day 18

If by Day 18 you have <12 active testers and the Day-21 mid-check is
about to fail, **act on Day 18 not Day 21**.

### Option A — recruit + delay submit
- Recruit 5 more from Tier 3 (Reddit/Facebook/Discord) on Day 18.
- Push the production-submit date by 7 days (new Day-28 = 2026-05-30).
- This shifts the launch window by one week. Tolerable.

### Option B — accept the 14-day reset
- If recruit pace doesn't accelerate, restart the 14-day clock by
  rolling out a new build to Closed Testing (forces tester re-engagement
  — though Play has gotten stricter about this in 2025-2026, may not
  reset).
- Worst case: 14 more days, launch around 2026-06-13.

### Option C — public-discoverable Closed Testing
- Convert the Closed Testing track to "anyone with the link can join."
- Post the join link on r/genealogy + Facebook memorial groups.
- Risk: low-quality testers who join and never open the app.
- Use only if Options A and B both fail.

### Don't do
- ❌ Open testing as a workaround. Open testing has its own restrictions
  and starts a different 14-day clock.
- ❌ Bribe testers to fake-engage. Play detects single-session installs
  with no activity and counts them as inactive.
- ❌ Add fake test accounts. Play correlates IP / device IDs and will
  reject the production submit.

---

## 7. Tester roster template

Track in `docs/BETA_TESTERS.txt` (gitignored — contains personal info).
File format below:

```
# haloFrame beta testers — DO NOT COMMIT
# Format: <yyyy-mm-dd>  <name>  <email>  <channel>  <status>  <notes>

# 2026-04-25  Day 0 send batch
2026-04-25  Friend 1     friend1@gmail.com    iMessage      yes      android Pixel 7
2026-04-25  Friend 2     friend2@gmail.com    WhatsApp      yes      android Galaxy
2026-04-25  Cousin 1     cousin1@gmail.com    iMessage      maybe    android, slow replies
2026-04-25  Coworker 1   coworker1@yahoo.com  LinkedIn      no       iPhone-only
...

# 2026-05-05  Day 10 status check
# 12 yeses confirmed; 0 ghosts to chase
```

---

## 8. After-action — capture lessons

After production launches, append a notes section here:

- How many DMs did it actually take to land 12 active?
- Which channel had the highest yield?
- Did the lifetime Heritage incentive feel proportionate, or did
  you wish you'd offered something else?
- Did anyone uninstall during the window? Why?

This becomes input for the next test cycle (e.g. v2.0 phased rollout
or a new app from the same developer account, which has the same 14-day
rule for the FIRST closed test of each app — though subsequent apps
are easier).

---

## 9. Update log

| Date | Change | By |
| --- | --- | --- |
| 2026-04-25 | Initial authoring (Phase 11.3) | Claude |
