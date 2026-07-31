import { Platform } from 'react-native';

/**
 * El aviso de que el bloque acabo: suena con la app abierta Y con la app cerrada.
 *
 * Es la mitad del cronometro: enfocarse 25 minutos significa dejar el telefono, y un reloj que solo
 * suena si lo estas mirando no sirve. La app programa un aviso local con la hora exacta del final —
 * no hay push desde el servidor y no hace falta, porque un aviso local sobrevive a que la app se
 * cierre y no cuesta infraestructura (es la misma decision que ya documenta el API para los
 * recordatorios de tareas).
 *
 * Para que suene tambien EN PRIMER PLANO hace falta un `setNotificationHandler`: por defecto iOS se
 * traga las notificaciones mientras la app esta al frente. El handler es global, asi que discrimina
 * por `data.kind` y solo cambia el comportamiento de las del cronometro — sin eso, registrarlo desde
 * aqui haria que cualquier recordatorio de tarea empezara a sonar encima de la app.
 *
 * NUNCA lanza, y el import va DENTRO del try por lo mismo que `register-device.ts`: en un binario
 * sin el modulo nativo compilado, cargar expo-notifications revienta, y un import arriba se llevaria
 * la pantalla del cronometro por delante. Sin avisos el cronometro sigue funcionando entero mientras
 * la app este abierta, asi que no hay nada que reportar hacia arriba.
 */

/** Marca nuestras notificaciones para que el handler global no toque las de nadie mas. */
const KIND = 'tdapp.timer.alarm';

/** El unico aviso vivo. Solo puede haber un bloque corriendo, asi que un id basta. */
let armedId: string | null = null;

/** El handler es global y se registra una vez por proceso. */
let handlerReady = false;

const CHANNEL = 'timer';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Deja que las del cronometro suenen y se vean con la app al frente; el resto sigue con el
 * comportamiento por defecto del sistema.
 */
function ensureHandler(Notifications: NotificationsModule) {
  if (handlerReady) return;
  handlerReady = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const mine = notification.request.content.data?.kind === KIND;
      return {
        shouldPlaySound: mine,
        shouldShowBanner: mine,
        shouldShowList: mine,
        // El cronometro no es una bandeja de pendientes: un globo rojo en el icono no aporta.
        shouldSetBadge: false,
      };
    },
  });
}

/** Programa el aviso para dentro de `seconds`. Reemplaza el anterior: nunca suenan dos. */
export async function armAlarm(seconds: number, title: string, body: string) {
  // El trigger de intervalo exige al menos un segundo; por debajo de eso no hay nada que avisar.
  if (seconds < 1) return;

  try {
    const Notifications = await import('expo-notifications');
    await disarmAlarm();
    ensureHandler(Notifications);

    // Sin canal, Android 8+ manda el aviso a un default silencioso y el bloque acaba sin sonar.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Cronómetro',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // El permiso puede venir del onboarding, pero pudo negarse o no haberse pedido nunca.
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      if (!permissions.canAskAgain) return;
      const asked = await Notifications.requestPermissionsAsync();
      if (!asked.granted) return;
    }

    armedId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        // `timeSensitive` atraviesa el resumen programado de notificaciones: un bloque que acabo
        // hace veinte minutos ya no sirve de nada.
        interruptionLevel: 'timeSensitive',
        data: { kind: KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: CHANNEL,
        seconds,
        repeats: false,
      },
    });
  } catch {
    armedId = null;
  }
}

/** Cancela el aviso vivo. Se llama al pausar, reiniciar, saltar y al salir de la pantalla. */
export async function disarmAlarm() {
  if (!armedId) return;

  const id = armedId;
  // Se limpia ANTES de esperar: si se pausa dos veces seguidas, la segunda no vuelve a cancelar.
  armedId = null;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Un aviso que no se pudo cancelar suena de mas; peor seria tumbar la pantalla por eso.
  }
}
