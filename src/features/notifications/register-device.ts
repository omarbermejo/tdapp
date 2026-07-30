import Constants from 'expo-constants';
import type * as NotificationsTypes from 'expo-notifications';
import { Platform } from 'react-native';

import { api, type DevicePlatform } from '@/features/auth/api';

export type PushResult = 'granted' | 'denied' | 'unsupported';

/** En iOS la autorizacion provisional tambien sirve para entregar avisos. */
const allowed = (
  permissions: NotificationsTypes.NotificationPermissionsStatus,
  provisional: number
) => permissions.granted || permissions.ios?.status === provisional;

/**
 * Pide permiso, saca el push token de Expo y lo guarda en la API.
 *
 * NUNCA lanza. El import de expo-notifications va DENTRO del try a proposito: en un binario
 * que no trae el modulo nativo compilado (Expo Go, o un dev build de antes de agregarlo) el
 * modulo revienta al cargarse, y un import arriba se llevaria la pantalla entera por delante.
 *
 * Los demas caminos de fallo terminan igual: permiso negado, simulador sin token de APNs,
 * Android sin Firebase, o falta el projectId de EAS. Quedarse encerrado en el ultimo paso del
 * onboarding seria peor que no tener avisos.
 */
export async function registerPushDevice(token: string): Promise<PushResult> {
  try {
    const Notifications = await import('expo-notifications');

    // El canal va ANTES de pedir permiso: sin al menos uno, Android 13+ no muestra el dialogo.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Recordatorios',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const provisional = Notifications.IosAuthorizationStatus.PROVISIONAL;
    let permissions = await Notifications.getPermissionsAsync();
    if (!allowed(permissions, provisional) && permissions.canAskAgain) {
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (!allowed(permissions, provisional)) return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return 'unsupported';

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice(token, data, Platform.OS as DevicePlatform);
    return 'granted';
  } catch {
    return 'unsupported';
  }
}
