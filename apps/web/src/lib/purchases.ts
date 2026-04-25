// =============================================================================
// HaloFrame web — RevenueCat client wrapper
//
// On native (Capacitor.isNativePlatform()), this routes subscription-related
// calls through `@revenuecat/purchases-capacitor` which talks to Apple IAP /
// Google Play Billing under the hood. On web, every entry is a safe no-op
// (returns null or throws "native only") because subscriptions on the web
// surface still go through Stripe.
//
// The RC SDK is lazy-imported so the web bundle doesn't pay the cost of
// shipping native bridge code that never runs.
// =============================================================================
import { Capacitor } from '@capacitor/core';

let initialised = false;

export interface InitRCOptions {
  apiKey: string;
  appUserId?: string;
}

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initRC(opts: InitRCOptions): Promise<void> {
  if (!isNative() || initialised) return;
  const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: opts.apiKey, appUserID: opts.appUserId });
  initialised = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const result = await Purchases.getOfferings();
  return result.offerings;
}

// PurchasesPackage is RC's package shape; we accept it as `unknown`-ish here
// because the real type lives behind a dynamic import that the web bundle
// never runs. PaywallScreen narrows via offerings.availablePackages.
export async function purchasePackage(pkg: unknown) {
  if (!isNative()) {
    throw new Error('IAP only available on native platforms');
  }
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  return Purchases.purchasePackage({ aPackage: pkg as never });
}

export async function restorePurchases() {
  if (!isNative()) {
    throw new Error('Restore Purchases only available on native platforms');
  }
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  return Purchases.restorePurchases();
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const result = await Purchases.getCustomerInfo();
  return result.customerInfo;
}

export async function logIn(userId: string): Promise<void> {
  if (!isNative()) return;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  await Purchases.logIn({ appUserID: userId });
}
