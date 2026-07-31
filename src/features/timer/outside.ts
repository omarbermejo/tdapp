import type { LiveActivity, LiveActivityFactory } from 'expo-widgets';
import { Platform } from 'react-native';

import type { FocusActivityProps } from '@/widgets/focus-activity';

/**
 * El bloque de enfoque visto desde FUERA de la app: es el punto del cronometro.
 *
 * Enfocarse 25 minutos significa soltar el telefono, y un reloj que solo existe dentro de una
 * pantalla abierta no sirve para eso. Las dos plataformas resuelven lo mismo de formas muy
 * distintas, y este modulo es el unico lugar que conoce esa diferencia:
 *
 * - **iOS**: Live Activity. La cuenta atras la pinta SwiftUI con `Text(timerInterval:)` y corre
 *   SOLA, sin que la app despierte. Se ve en la Isla Dinamica y en la pantalla de bloqueo.
 * - **Android**: no existe nada equivalente. Una notificacion fija (`sticky`) es lo mas cerca, pero
 *   `expo-notifications` no expone `usesChronometer` ni `ProgressStyle`, asi que NO se puede pintar
 *   una cuenta atras viva: habria que reescribir el texto cada segundo y con la app suspendida no
 *   hay JS que lo haga. En vez de mentir con un numero congelado se muestra la HORA DE FIN
 *   ("termina 7:16"), que es un dato estatico y siempre cierto.
 *
 * Nada de esto lanza NUNCA: el bloque local tiene que correr aunque el sistema no quiera pintarlo.
 */

export type Block = {
  /** 'Enfoque' · 'Descanso corto' · 'Descanso largo'. */
  phase: string;
  /** Si el bloque es un descanso. Explícito para que el otro proceso no compare etiquetas. */
  resting: boolean;
  /** Titulo de la tarea enganchada, '' si el bloque va libre. */
  task: string;
  startedAt: number;
  endsAt: number;
  /** Epoch ms del instante en que se pauso. 0 = corriendo. */
  pausedAt: number;
  /** Hex del acento, resuelto en la app. */
  tint: string;
  done: number;
  rounds: number;
  /** 'termina 7:16', ya formateado con el reloj del telefono. Solo lo usa Android. */
  endsAtLabel: string;
};

/** Identificador fijo: presentar otra con el mismo id REEMPLAZA la anterior en vez de apilarla. */
const ONGOING_ID = 'tdapp-focus-ongoing';
const CHANNEL = 'timer';

/**
 * La actividad viva. Se guarda para poder actualizarla y cerrarla.
 *
 * Los tipos se importan con `import type`, que TypeScript borra al compilar: el modulo NO se carga
 * al leer este archivo. Eso es lo que hace que los `import()` de abajo sirvan de algo — en un binario
 * sin la parte nativa compilada, cargar expo-widgets revienta, y un import de valor arriba se
 * llevaria la pantalla del cronometro por delante.
 */
let activity: LiveActivity<FocusActivityProps> | null = null;

/** iOS 16.2+ y con Live Activities habilitadas. Fuera de iOS expo-widgets ya devuelve stubs no-op. */
const IOS = Platform.OS === 'ios';

/** Arranca (o actualiza, si ya habia una) el bloque visible fuera de la app. */
export async function showBlock(block: Block) {
  if (IOS) return showActivity(block);
  return showOngoing(block);
}

/** Lo quita. Se llama al pausar, al cerrar el bloque, al salir de la pantalla y al reiniciar. */
export async function hideBlock() {
  if (IOS) return hideActivity();
  return hideOngoing();
}

// --- iOS ---------------------------------------------------------------------------------------

/**
 * `start()` para la primera y `update()` para las siguientes: arrancar una nueva cada vez apilaria
 * actividades en la pantalla de bloqueo (iOS permite varias del mismo tipo).
 */
async function showActivity(block: Block) {
  try {
    const { default: FocusActivity } = await import('@/widgets/focus-activity');
    const props = {
      phase: block.phase,
      resting: block.resting,
      task: block.task,
      startedAt: block.startedAt,
      endsAt: block.endsAt,
      pausedAt: block.pausedAt,
      tint: block.tint,
      done: block.done,
      rounds: block.rounds,
    };

    if (activity) {
      await activity.update(props);
      return;
    }

    // Actividades de una sesion anterior (la app murio con el bloque corriendo) quedarian vivas
    // hasta que iOS las expire. Se cierran antes de abrir la nueva.
    await endStrays(FocusActivity);
    activity = FocusActivity.start(props);
  } catch {
    // iOS < 16.2, el usuario las desactivo en Ajustes, o el binario no trae la extension.
    activity = null;
  }
}

async function hideActivity() {
  const live = activity;
  // Se limpia ANTES de esperar: dos pausas seguidas no deben intentar cerrar la misma dos veces.
  activity = null;
  if (!live) return;
  try {
    // 'immediate': el bloque se acabo o se pauso, y dejarlo cuatro horas en la pantalla de bloqueo
    // convierte la Live Activity en basura que hay que barrer a mano.
    await live.end('immediate');
  } catch {
    // Una actividad que no se pudo cerrar la expira el sistema; no vale tumbar la pantalla por eso.
  }
}

/** Cierra las actividades huerfanas de sesiones pasadas. */
async function endStrays(factory: LiveActivityFactory<FocusActivityProps>) {
  try {
    await Promise.all(factory.getInstances().map((stray) => stray.end('immediate')));
  } catch {
    // getInstances lanza en iOS < 16.1; ahi no hay nada huerfano que cerrar.
  }
}

// --- Android -----------------------------------------------------------------------------------

/**
 * Notificacion fija con la hora de fin. `sticky` la vuelve no-descartable con swipe y
 * `autoDismiss: false` evita que tocarla la borre.
 *
 * `sound: false` y `shouldPlaySound` apagado en el handler: esta notificacion es un cartel
 * permanente, no un aviso. La que suena es la del final del bloque, que vive en `alarm.ts`.
 */
async function showOngoing(block: Block) {
  try {
    const Notifications = await import('expo-notifications');

    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Cronómetro',
      importance: Notifications.AndroidImportance.MAX,
    });

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: ONGOING_ID,
      content: {
        title: block.task || block.phase,
        // El cuerpo dice la hora de fin porque es lo unico que no envejece: una cuenta atras
        // escrita aqui se quedaria congelada en cuanto la app se suspenda.
        body: block.pausedAt > 0 ? `${block.phase} · en pausa` : `${block.phase} · ${block.endsAtLabel}`,
        sticky: true,
        autoDismiss: false,
        sound: false,
        color: block.tint,
      },
      trigger: null,
    });
  } catch {
    // Sin permiso, sin canal o sin modulo nativo: el bloque local sigue corriendo igual.
  }
}

async function hideOngoing() {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.dismissNotificationAsync(ONGOING_ID);
    await Notifications.cancelScheduledNotificationAsync(ONGOING_ID);
  } catch {
    // Nada que quitar.
  }
}
