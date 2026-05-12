# haloFrame — TestFlight "What to Test" copy

This is the canonical "What to Test" note pushed to App Store Connect on
every external build submission. It's shown to **both** beta reviewers
(Apple's internal beta-review team that approves each external build)
and beta testers (the people invited via the `external testers` beta
group) the moment they open the build in TestFlight.

**4000 char limit. Currently using ~1,200 chars — plenty of headroom.**

The marketing-voice rule from `docs/STORE_LISTINGS.md` still applies:
*honoring / remembering / tribute* — never *deepfake / resurrect /
bring back*.

To push this to ASC for a specific build:

```
node scripts/asc-build-status.mjs set-test-notes <buildId>
```

The script reads this file at runtime (everything inside the fenced
`whatToTest` block below), so editing this file is enough — no script
changes needed.

---

## en-US whatToTest

```whatToTest
First external build of haloFrame: Memorial Portraits.

Please try the two main flows:

1. REUNITE — add a loved one who couldn't be there back into a family
   photo. Upload a group photo plus a clear portrait of the missing
   person, then review the composite. The first cold-start run can
   take 60–70s; subsequent runs are faster.

2. ENHANCE — restore an old or faded photograph. Upload one picture,
   wait ~20s, compare to the original.

We'd love specific feedback on:

• Does the small "AI-generated" badge that appears on every output
  feel clear and respectful?
• Does the Reunite result look like the person you uploaded? If a
  feature drifted (eyes / smile / hair / glasses), please mention which.
• Print Shop — open a finished tribute, tap Print, and see if the
  canvas-size preview matches what you'd actually want to hang.

You start with 1 free Reunite + 1 free Enhance to try the app. Keepsake
($9.99) and Heritage ($24.99 / $199 annual) bundles add tributes that
never expire.

Known issues in this build:

• First Reunite of a session has a 60–70s cold start while the model
  warms up.
• If your "missing person" portrait is heavily backlit or under 200×200
  px, identity preservation drops. Use the clearest face photo you have.

How to send feedback:

• Tap the share-feedback button inside TestFlight (preferred — Apple
  attaches device + version metadata).
• Or email support@gethaloframe.com with "TestFlight" in the subject so
  we route to the beta queue.

Thank you for helping us ship something families can trust.
```
