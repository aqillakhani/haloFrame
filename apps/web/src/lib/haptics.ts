// =============================================================================
// Haptics — web is a no-op; native uses Capacitor Haptics.
// Centralizes every haptic call site so the swap is one file.
// =============================================================================
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticEvent =
  | 'press'    // Light
  | 'select'   // Selection
  | 'success'  // Notification.Success
  | 'warning'  // Notification.Warning
  | 'snap';    // Selection (very light)

export function haptic(event: HapticEvent): void {
  if (!Capacitor.isNativePlatform()) return;
  // Intentionally fire-and-forget — haptics should never block UI.
  void runHaptic(event);
}

async function runHaptic(event: HapticEvent): Promise<void> {
  try {
    switch (event) {
      case 'press':
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
      case 'select':
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
        return;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        return;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      case 'snap':
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
    }
  } catch (err) {
    // Some devices disable haptics at the OS level; absorb silently.
    console.warn('[haptics] failed', err);
  }
}
