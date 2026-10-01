// The app shell (iOS / Android via Capacitor). On the web every call is a no-op.
// Native-only plugins are imported lazily so the web build never loads them.
import { Capacitor } from '@capacitor/core';

const NATIVE = Capacitor.isNativePlatform();
const ASKED_KEY = 'ignition.notifyAsked';
const END_ID = 1;

let haptics = null, keepAwake = null, notes = null;
let endAt = 0;          // epoch ms of the sunset, while a session runs

export const isNative = NATIVE;

export async function initNative() {
  if (!NATIVE) return;
  document.documentElement.classList.add('native');
  // status bar and home indicator are hidden by the built-in SystemBars plugin (capacitor.config.json)
  const [h, k, n] = await Promise.all([
    import('@capacitor/haptics'),
    import('@capacitor-community/keep-awake'),
    import('@capacitor/local-notifications'),
  ]);
  haptics = h; keepAwake = k.KeepAwake; notes = n.LocalNotifications;
  // a stale reminder from a session that was killed with the app
  try { await notes.cancel({ notifications: [{ id: END_ID }] }); } catch (e) { /* none */ }
}

// ---- haptics: a tick when the hold reaches full power, a heavy blow at ignition
export function tap(kind) {
  if (!haptics) return;
  const { Haptics, ImpactStyle } = haptics;
  const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  Haptics.impact({ style }).catch(() => {});
}

// ---- the session: the screen stays on; leaving the app schedules the "sunset" reminder
export function sessionBegin(endEpochMs) {
  endAt = endEpochMs;
  if (keepAwake) keepAwake.keepAwake().catch(() => {});
}
export function sessionMoved(endEpochMs) { endAt = endEpochMs; }
export function sessionFinish() {
  endAt = 0;
  if (keepAwake) keepAwake.allowSleep().catch(() => {});
  cancelReminder();
}

// the app went to the background mid-session: the OS delivers the end
export async function appHidden() {
  if (!notes || !endAt || endAt - Date.now() < 2000) return;
  try {
    const p = await notes.checkPermissions();
    if (p.display !== 'granted') return;
    await notes.schedule({ notifications: [{
      id: END_ID,
      title: 'Your ascent is complete',
      body: 'The sun has set. Come back down when you are ready.',
      schedule: { at: new Date(endAt), allowWhileIdle: true },
    }] });
  } catch (e) { /* no reminder */ }
}
export function appVisible() { cancelReminder(); }
function cancelReminder() {
  if (notes) notes.cancel({ notifications: [{ id: END_ID }] }).catch(() => {});
}

// asked once, after the first finished session, never in the middle of a launch
export async function askForReminders() {
  if (!notes) return;
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, '1');
  } catch (e) { return; }
  try { await notes.requestPermissions(); } catch (e) { /* declined */ }
}
