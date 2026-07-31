import { Platform } from 'react-native';

/**
 * La plomería compartida de los avisos locales: el handler global, los canales de Android y el
 * permiso.
 *
 * Vive aparte porque `setNotificationHandler` es **uno por proceso**, y mientras vivió dentro de
 * `timer/alarm.ts` solo existía si alguien había armado una alarma. Eso dejaba dos agujeros:
 * cualquier aviso que llegara con la app al frente sin alarma puesta se moría en silencio (el
 * default de expo-notifications sin handler tampoco es mostrar: es NO mostrar), y con el handler
 * puesto, cualquier aviso que no fuera exactamente el del cronómetro quedaba sin banner y sin
 * sonido — que es justo lo que le pasaba al cartel fijo de Android.
 *
 * Nada de aquí lanza por su cuenta: quien llama ya tiene el `try` que necesita.
 */

/** Todos nuestros avisos marcan su `data.kind` con esto. El handler decide por prefijo. */
export const KIND_PREFIX = 'tdapp.';

/** Los dos canales de Android que existen, con su nombre visible en los ajustes del sistema. */
const CHANNELS = { timer: 'Cronómetro', reminders: 'Recordatorios' } as const;
export type Channel = keyof typeof CHANNELS;

/** Tipa el módulo sin cargarlo: `import type` se borra al compilar. */
export type NotificationsModule = typeof import('expo-notifications');

let handlerReady = false;

/**
 * Deja que los avisos NUESTROS se vean con la app al frente.
 *
 * Por PREFIJO y no por igualdad exacta: los kinds crecen (cronómetro, cartel fijo, recordatorio
 * diario, aviso de tarea) y el predicado no tiene por qué enterarse de cada uno. Cuesta lo mismo
 * (`startsWith` contra `===`) y evita que la plomería tenga que conocer la lista.
 *
 * Y por lista blanca y no negra aunque la negra sería más corta: esta app no recibe nada de nadie
 * —no hay push— así que todo lo que existirá es nuestro y todo lleva `data.kind`. Una lista negra
 * le daría permiso de sonar a lo que apareciera.
 *
 * `quiet` lo pone quien agenda: el cartel fijo de Android es un cartel, no un aviso, y sonar
 * estaría mal.
 */
export function ensureHandler(N: NotificationsModule) {
  if (handlerReady) return;
  handlerReady = true;

  N.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const mine = typeof data?.kind === 'string' && data.kind.startsWith(KIND_PREFIX);
      return {
        shouldShowBanner: mine,
        shouldShowList: mine,
        shouldPlaySound: mine && data?.quiet !== true,
        // Esta app no es una bandeja de pendientes: un globo rojo en el icono no aporta.
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Sin canal, Android 8+ manda el aviso a un default silencioso. Y sin NINGUNO, Android 13+ no
 * llega ni a mostrar el diálogo de permiso.
 */
export async function ensureChannel(N: NotificationsModule, channel: Channel) {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(channel, {
    name: CHANNELS[channel],
    importance: N.AndroidImportance.MAX,
  });
}

/**
 * ¿El sistema va a entregar?
 *
 * `ask` solo lo pone quien tiene derecho a interrumpir con un diálogo: el cronómetro (acabas de
 * tocar "empezar", así que el diálogo se explica solo) y el paso del onboarding que lo pide. Los
 * recordatorios NO preguntan nunca — un diálogo del sistema al arrancar la app, salido de nada, es
 * peor que no tener recordatorio.
 *
 * `granted` a secas, sin rama para PROVISIONAL: la autorización provisional de iOS solo existe si
 * se pide con `allowProvisional`, y aquí `requestPermissionsAsync()` va sin opciones. Era una rama
 * que no se podía alcanzar.
 */
export async function canNotify(N: NotificationsModule, ask = false): Promise<boolean> {
  const permissions = await N.getPermissionsAsync();
  if (permissions.granted) return true;
  if (!ask || !permissions.canAskAgain) return false;
  return (await N.requestPermissionsAsync()).granted;
}

/**
 * El paso del onboarding: pide permiso para avisar.
 *
 * Sustituye a `registerPushDevice`, que hacía esto MÁS registrar un push token — y esa mitad nunca
 * funcionó: leía `extra.eas.projectId` de un `app.json` que nunca lo tuvo y salía siempre por
 * `return 'unsupported'` sin registrar nada. Lo que sí hacía falta era el permiso, porque los
 * avisos locales lo necesitan igual. Se quedó la mitad útil.
 *
 * Devuelve `void` a propósito: el onboarding ya declara que este permiso no se puede forzar, así
 * que no hay rama que tomar con el resultado. Y nunca lanza — quedarse encerrado en el último paso
 * del onboarding sería peor que no tener avisos.
 */
export async function askForNotifications(): Promise<void> {
  try {
    const N = await import('expo-notifications');
    // El canal va ANTES de pedir: sin al menos uno, Android 13+ no muestra el diálogo.
    await ensureChannel(N, 'reminders');
    await canNotify(N, true);
  } catch {
    // Sin el módulo nativo compilado no hay nada que pedir.
  }
}
