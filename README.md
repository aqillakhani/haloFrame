# HaloFrame

AI memorial photo & tribute app for iOS and Android. Built with Expo, Express, Supabase, RevenueCat, and fal.ai.

## Repo layout

```
haloFrame/
├── apps/
│   ├── mobile/          # Expo Router app (iOS + Android)
│   └── api/             # Express orchestration server
├── packages/
│   └── shared/          # Shared TypeScript types & constants
├── supabase/
│   └── migrations/      # SQL schema migrations
└── docs/                # Spike results, architecture notes
```

This is an npm workspaces monorepo. A single `npm install` at the root installs all workspaces.

## Quick start

```bash
# 1. Install everything
npm install

# 2. Configure env
cp .env.example .env
# fill in Supabase, fal.ai, RevenueCat keys

# 3. Build shared package
npm run build:shared

# 4. Run the API server
npm run dev:api

# 5. In another terminal, run the mobile app
npm run dev:mobile
```

## Phase 0 spikes

Before building UI, validate the riskiest assumptions:

```bash
npm run spike:sam3        # SAM 3 person/pet detection reliability
npm run spike:templates   # Nano Banana 2 Edit aesthetic quality
npm run spike:merge       # Reunite flow merge realism
```

Each spike writes a report and image samples to `docs/spike-results/`.

## Architecture

See `C:/Users/claws/.claude/plans/shiny-scribbling-hopcroft.md` for the full implementation plan and architectural decisions.
