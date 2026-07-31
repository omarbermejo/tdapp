import { canNotify, ensureChannel, ensureHandler } from '@/features/notifications/local';

/**
 * El aviso de que el bloque acabo: suena con la app abierta Y con la app cerrada.
 *
 * Es la mitad del cronometro: enfocarse 25 minutos significa dejar el telefono, y un reloj que solo
 * suena si lo estas mirando no sirve. La app programa un aviso local con la hora exacta del final —
 * no hay push desde el servidor y no hace falta, porque un aviso local sobrevive a que la app se
 * cierre y no cuesta infraestructura (la misma decision que los recordatorios de `notifications/`).
 *
 * Para que suene tambien EN PRIMER PLANO hace falta un `setNotificationHandler`, y ese vive ahora en
 * `notifications/local.ts` y no aqui: es uno por proceso, y mientras vivio en este archivo solo
 * existia si alguien habia armado una alarma. Aqui solo queda lo que es del cronometro y de nadie
 * mas: el id armado y la carrera de `forgetAlarm`.
 *
 * NUNCA lanza, y el import va DENTRO del try a proposito: en un binario sin el modulo nativo
 * compilado, cargar expo-notifications revienta, y un import arriba se llevaria la pantalla del
 * cronometro por delante. Sin avisos el cronometro sigue funcionando entero mientras la app este
 * abierta, asi que no hay nada que reportar hacia arriba.
 */

/** Marca nuestras notificaciones para que el handler global las deje sonar. */
const KIND = 'tdapp.timer.alarm';

/** El unico aviso vivo. Solo puede haber un bloque corriendo, asi que un id basta. */
let armedId: string | null = null;

const CHANNEL = 'timer';

/** Programa el aviso para dentro de `seconds`. Reemplaza el anterior: nunca suenan dos. */
export async function armAlarm(seconds: number, title: string, body: string) {
  // El trigger de intervalo exige al menos un segundo; por debajo de eso no hay nada que avisar.
  if (seconds < 1) return;

  try {
    const Notifications = await import('expo-notifications');
    await disarmAlarm();
    ensureHandler(Notifications);
    await ensureChannel(Notifications, CHANNEL);

    // `true`: el permiso puede venir del onboarding, pero pudo negarse o no haberse pedido nunca —
    // y aqui se puede preguntar, porque el usuario acaba de tocar "empezar".
    if (!(await canNotify(Notifications, true))) return;

    armedId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        /**
         * La intencion es atravesar el resumen programado de notificaciones: un bloque que acabo
         * hace veinte minutos ya no sirve de nada.
         *
         * ponytail: hoy iOS lo degrada a `active` en silencio, porque falta el entitlement
         * `com.apple.developer.usernotifications.time-sensitive` en `ios/tdapp/tdapp.entitlements`.
         * Se queda puesto porque es lo que se quiere decir y no cuesta nada. Techo: agregar el
         * entitlement, que con `ios/` prebuildeado y firma automatica es un cambio de build y no de
         * codigo — hay que hacerlo a conciencia, no de paso.
         */
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

/**
 * Suelta el aviso SIN cancelarlo, para cuando el bloque llego a cero.
 *
 * Existe por una carrera real: el aviso esta agendado para el instante exacto del final, y el tick
 * que detecta el cero corre en esos mismos milisegundos. Llamar `disarmAlarm()` ahi cancelaria la
 * notificacion justo antes de que el sistema la entregue — el bloque acabaria en silencio, que es
 * precisamente lo que el aviso existe para evitar. Ya cumplio: solo hay que olvidar su id.
 */
export function forgetAlarm() {
  armedId = null;
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
