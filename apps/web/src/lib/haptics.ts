// No-op on web. RN replaces with expo-haptics later.
// Centralizes haptic call sites so the swap is one file.

export type HapticEvent =
  | 'press'    // Light
  | 'select'   // Selection
  | 'success'  // Notification.Success
  | 'warning'  // Notification.Warning
  | 'snap';    // Selection (very light)

export function haptic(_event: HapticEvent): void {
  // Web: no-op.
}
