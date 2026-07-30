import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, type DevicePlatform } from '@/features/auth/api';

export type PushResult = 'granted' | 'denied' | 'unsupported';

/** En iOS la autorizacion provisional tambien sirve para entregar avisos. */
const allowed = (permissions: Notifications.NotificationPermissionsStatus) =>
  permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

/**
 * Pide permiso, saca el push token de Expo y lo guarda en la API.
 *
 * NUNCA lanza: el onboarding tiene que terminar igual si el usuario dice no, si corre en
 * simulador (no hay token de APNs), si Android no tiene Firebase configurado, o si falta el
 * projectId de EAS. Quedarse encerrado en el ultimo paso seria peor que no tener avisos.
 */
export async function registerPushDevice(token: string): Promise<PushResult> {
  try {
    // El canal va ANTES de pedir permiso: sin al menos uno, Android 13+ no muestra el dialogo.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Recordatorios',
        importance: Notifications.AndroidImportance.MAX,
      })
    }

    let permissions = await Notifications.getPermissionsAsync();
    if (!allowed(permissions) && permissions.canAskAgain) {
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (!allowed(permissions)) return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return 'unsupported';

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice(token, data, Platform.OS as DevicePlatform);
    return 'granted';
  } catch {
    return 'unsupported';
  }
}
