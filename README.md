# haloFrame

AI memorial photo & tribute app: upload photos of loved ones and pets, apply memorial-tuned AI templates, optionally merge separate photos, then save and order physical prints.

[Live demo](https://halo-frame-web.vercel.app) · **Walkthrough:** [CONFIRM]

## Problem

Creating a dignified memorial tribute is emotionally difficult and often beyond a user's editing skill. haloFrame removes the friction by automating template application and photo compositing, allowing families to create meaningful tributes with a few taps.

## What it does

- **Photo detection**: upload single or group photos; automatic subject detection via SAM-3 segmentation
- **8+ memorial templates**: Heaven's Light, Golden Halo, Rainbow Bridge (for pets), and more—generated via fal.ai image synthesis
- **Reunite flow**: merge a loved one from a separate photo into a family group scene with matched lighting and scale
- **Subject anchoring**: effects apply only to the selected person, preserving the integrity of group photos
- **Credits-based paywall**: 2 free tributes; [CONFIRM] live Stripe + RevenueCat setup for additional credits
- **Print fulfillment**: export designs and submit for physical canvas/print production

## Stack

**Web**: React 18 + Vite + TypeScript  
**Mobile**: React Web Bundle + Capacitor (iOS via Codemagic TestFlight CI; [CONFIRM] Android status)  
**Backend**: Express (Node) + fal.ai (SAM-3 segmentation, image generation)  
**Data**: Supabase (PostgreSQL, Auth)  
**Payments**: Stripe (print checkout) + RevenueCat (subscriptions)  
**Monorepo**: npm workspaces (@haloframe/web, @haloframe/api, @haloframe/shared)

## Architecture

npm workspaces monorepo: **@haloframe/web** (React Vite app handling auth, Enhance/Reunite flows, templates, paywall, print shop) and **@haloframe/api** (Express orchestration: fal.ai calls, image merge/compositing, SAM-3 subject detection, credit ledger, subscription gating). **@haloframe/shared** provides TypeScript types and Zod schemas. Mobile wraps the web bundle via Capacitor native containers, shipping to iOS via Codemagic.

## Run it

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, FAL_KEY, REVENUECAT_SECRET_KEY, STRIPE_SECRET_KEY

# 3. Build shared
npm run build:shared

# 4. Start API and web (separate terminals, or concurrent)
npm run dev:api      # runs on port 4000
npm run dev:web      # runs on port 5173; proxies /api to :4000

# Or run both in parallel:
npm run dev
```

Spike scripts available to validate risky assumptions:

```bash
npm run spike:sam3      # SAM-3 person/pet detection reliability
npm run spike:templates # Template aesthetic quality
npm run spike:merge     # Reunite flow merge realism
```
