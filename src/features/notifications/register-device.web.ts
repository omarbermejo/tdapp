// ponytail: el push en web pide VAPID y un service worker, y no hay a quien avisar todavia.
// Devolver 'unsupported' mantiene expo-notifications fuera del bundle web.
export type PushResult = 'granted' | 'denied' | 'unsupported';

export async function registerPushDevice(): Promise<PushResult> {
  return 'unsupported';
}
