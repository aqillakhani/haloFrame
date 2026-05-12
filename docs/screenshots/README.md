# haloFrame — Store screenshots

Three bundles received from the designer 2026-05-12. The layout in each
bundle is **8 frames**, where frame #1 is a landscape "hero" shot and
frames #2–8 are portrait product screenshots.

## What to upload where

### Apple App Store

ASC accepts the **6.7" iPhone screenshot slot** as canonical — Apple
auto-derives 6.5" and smaller from your 6.7" upload. So unless you
need device-specific shots, the 6.7" bundle is enough.

| File | Dimensions | Slot | Note |
| --- | --- | --- | --- |
| `apple-6.7/01.png` | 2556 × 1179 (landscape) | ⚠️ skip on first pass | These are iPhone 6.1" landscape dimensions, **not** 6.7". ASC's 6.7" portrait slot won't accept it. If you want a landscape hero, ASC has a separate landscape slot that needs 2796×1290 (true 6.7"). Re-export from the designer or skip. |
| `apple-6.7/02.png` … `08.png` | 1290 × 2796 (portrait) | Apple 6.7" iPhone screenshots | Upload all 7 — Apple accepts 3–10 per device class. |

The `apple-6.5/` directory contains a parallel bundle but its
dimensions are 1179 × 2556 (iPhone 6.1" portrait), not the 1284×2778
or 1242×2688 ASC's 6.5" slot requires. **Don't upload these as 6.5"
screenshots** — they'll be rejected. Apple's auto-scale from 6.7"
handles the 6.5" slot cleanly. Files are kept in-repo only for
designer-reference purposes.

### Google Play

Play allows **2–8 phone screenshots**, between 320–3840 px on the
longer side, ratio between 9:16 and 16:9. All 8 frames qualify.

| File | Dimensions | Note |
| --- | --- | --- |
| `android/01.png` | 1920 × 1080 (landscape) | Valid 16:9 phone frame. |
| `android/02.png` … `08.png` | 1080 × 1920 (portrait) | Valid 9:16 phone frames. |

Upload all 8 to **Play Console → Grow → Store presence → Main store
listing → Phone screenshots**.

## Upload mapping

The frames map to the recommended sequence in `docs/STORE_LISTINGS.md`
§2.4:

| Frame | Suggested ASC / Play caption |
| --- | --- |
| 02 | Home — "For the ones we carry with us" |
| 03 | Reunite — flow intro |
| 04 | Reunite — result with "AI-generated" badge visible |
| 05 | Enhance — flow intro |
| 06 | Enhance — result |
| 07 | My Tributes — gallery |
| 08 | Settings showing Restore Purchases |

(Frame 01, the landscape hero, is the designer's intended "feature
graphic" / cover frame. Use it for Play's **Feature Graphic** slot
after resizing to 1024 × 500, or treat it as marketing collateral
rather than a store-listing screenshot. The Apple equivalent is "App
Preview" video — Apple's slot doesn't take a still cover image.)

## Source files

Original designer ZIPs are in `C:/Users/claws/Downloads/`:
- `Apple App Store (6.7”)-20260512T205117Z-3-001.zip`
- `Apple App Store (6.5”)-20260512T205112Z-3-001.zip`
- `Google Play-20260512T205123Z-3-001.zip`

The unzipped + renamed copies in this directory are what gets
committed to the repo. The original ZIPs are kept locally for
archival only.
