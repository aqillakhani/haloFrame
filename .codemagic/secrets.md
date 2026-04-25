# Codemagic secrets — haloFrame

This file is documentation only. The actual secret values live in the
Codemagic dashboard so they never end up in git. Set them in:

**Codemagic dashboard → haloFrame project → Environment variables → groups.**

## haloframe_secrets (encrypted)

| Var | Where to find it | Notes |
|---|---|---|
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | App Store Connect → Users and Access → Integrations → App Store Connect API → your key row | The "Key ID" string (10 chars, e.g. `ABC123DEF4`) |
| `APP_STORE_CONNECT_ISSUER_ID` | Same page, top of the section | UUID (e.g. `9a8e7d6c-...`) |
| `APP_STORE_CONNECT_PRIVATE_KEY` | The `.p8` file Apple gave you when you created the key (one-time download — store it safely) | Paste the full contents *including* the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` markers. Mark as "Secure" so Codemagic encrypts it |
| `APPLE_TEAM_ID` | Apple Developer → Membership → Team ID | 10-char string |

The workflow itself reads these via the `haloframe_secrets` group declared
in `codemagic.yaml` under `environment.groups`.

## App Store Connect Integration

Codemagic also needs an "App Store Connect" *integration*, separately from
the env-var group. This is what `integrations.app_store_connect: haloframe_asc`
in `codemagic.yaml` refers to.

In Codemagic → **Teams → Integrations → App Store Connect → Add integration**:

- **Integration name:** `haloframe_asc` (must match the YAML)
- **Issuer ID:** same value as `APP_STORE_CONNECT_ISSUER_ID`
- **Key ID:** same value as `APP_STORE_CONNECT_KEY_IDENTIFIER`
- **Private key:** upload the `.p8` file directly (Codemagic stores it
  encrypted; do not paste contents here)

Why both? The env-var group exposes the key to scripts that need to call
the ASC API directly (e.g. `app-store-connect fetch-signing-files`). The
integration is what Codemagic itself uses for the TestFlight upload step
in `publishing.app_store_connect`.

## First-run checklist

Before tagging, double-check:

- [ ] Bundle id `com.haloframe.app` is registered in App Store Connect →
  My Apps → "+" → New App. The bundle id has to exist on Apple's side
  before any upload will be accepted.
- [ ] Capability list (App Store Connect → your app → App Information)
  matches what `xcode-project use-profiles` will request — for v1 we only
  need In-App Purchase. (No HealthKit, no Push, no Sign in with Apple
  unless we add that.)
- [ ] At least one external tester is on the `external testers` beta
  group (App Store Connect → TestFlight → External Testing). Add yourself
  via your Apple ID's email if nobody else is there yet.

Then run:

```bash
git tag v1.0.0-rc1
git push origin v1.0.0-rc1
```

Codemagic auto-starts the iOS workflow.

| Stage | Wall-clock |
|---|---|
| Codemagic build (npm install → build-ipa) | ~12-15 min |
| TestFlight processing the new build | ~5-10 min |
| Build appears for internal testers | immediate after processing |
| External-review submission (manual in ASC) | ~24h Apple turnaround |

## Troubleshooting

- **"No matching profiles found"**: the `--create` flag on
  `app-store-connect fetch-signing-files` should have made one. If it
  didn't, the bundle id probably isn't registered yet (see first-run
  checklist).
- **Marketing version "1.0.0" already used in a previous tag**: agvtool
  will let you re-upload with the same marketing version as long as the
  build number is monotonically newer. Codemagic increments
  `BUILD_NUMBER` automatically per project.
- **`@revenuecat/purchases-capacitor does not have a Package.swift`
  warning**: harmless. Capacitor falls back to its own Package.swift
  generator — see the `cap sync` output for confirmation that 7 plugins
  were detected.

## Rotation

- ASC API key rotation: ASC → Users and Access → Keys → "+", revoke the
  old one, upload the new `.p8` to Codemagic in *both* the integration
  AND the env-var group. Tag a no-op `vX.Y.Z-rc-rotate` to verify.
- Team ID rotation: Apple does not normally rotate Team IDs. If yours
  changed (e.g. transfer to an org account), update `APPLE_TEAM_ID` in
  the env-var group; integration auto-updates from the new key.
