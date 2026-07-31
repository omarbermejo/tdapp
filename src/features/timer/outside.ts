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
  /**
   * Hex del acento resuelto para fondo OSCURO (`accentOnDark`), porque es donde se pinta: la
   * pantalla de bloqueo y la Isla son negras en los dos esquemas. No se puede resolver con
   * `useAccent()` — eso sigue el esquema de la app y deja el paso oscuro sobre negro.
   */
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
 * A donde lleva tocar la actividad. Sin esto la app abre donde la dejaste, que casi nunca es el
 * cronometro — y es la UNICA accion que una Live Activity puede ofrecer: la pantalla de bloqueo y
 * la Isla no admiten botones a proposito (la experiencia buena vive dentro de la app).
 *
 * Tres barras: el esquema es 'tdapp' (ver app.json) y expo-router lee la ruta del PATH, asi que
 * `tdapp://timer` dejaria 'timer' como host y la ruta vacia.
 */
const DEEP_LINK = 'tdapp:///timer';

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

/**
 * Reconcilia lo que el sistema esta pintando con lo que la app cree que hay. La pantalla la llama al
 * montar, en cuanto sabe si habia un bloque guardado.
 *
 * Es el arreglo del bug de "la isla deja de aparecer". Cuando la app muere con un bloque corriendo, la
 * Live Activity sobrevive (es del sistema) pero la referencia en memoria no, asi que la sesion nueva no
 * tenia forma de cerrarla ni de reusarla: cada vuelta abandonaba una y arrancaba otra. Se acumulaban
 * hasta pasar el limite de iOS, y de ahi en adelante `Activity.request()` fallaba y no aparecia nada.
 *
 * `getInstances()` devuelve instancias FUNCIONALES (pueden `update` y `end`, ver LiveActivityFactory.swift),
 * asi que la de la sesion anterior se adopta en vez de tirarse.
 */
export async function adoptBlock(block: Block | null) {
  if (!IOS) {
    if (!block) await hideOngoing();
    else await showOngoing(block);
    return;
  }

  try {
    const { default: FocusActivity } = await import('@/widgets/focus-activity');
    const live = FocusActivity.getInstances();

    // Sin bloque que representar, no queda ninguna: es la limpieza que faltaba.
    if (!block) {
      await Promise.all(live.map((stray) => stray.end('immediate')));
      activity = null;
      return;
    }

    // Se adopta UNA y se cierran las de mas: si quedaron varias de sesiones pasadas, apilarian
    // duplicados en la pantalla de bloqueo diciendo lo mismo.
    const [keep, ...extra] = live;
    await Promise.all(extra.map((stray) => stray.end('immediate')));
    activity = keep ?? null;
    // Con `activity` puesta esto hace `update`; sin ninguna viva, arranca la primera.
    await showActivity(block);
  } catch (error) {
    activity = null;
    if (__DEV__) console.warn('[timer] no se pudo reconciliar la Live Activity', error);
  }
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
    activity = FocusActivity.start(props, DEEP_LINK);
  } catch (error) {
    // iOS < 16.2, el usuario las desactivo en Ajustes, el binario no trae la extension, o —el caso
    // que costo un bug— iOS rechaza la peticion por tener demasiadas actividades vivas. Tragarselo en
    // silencio era justo lo que hacia imposible ver por que la isla dejaba de salir.
    activity = null;
    if (__DEV__) console.warn('[timer] no se pudo pintar la Live Activity', error);
  }
}

/**
 * Cierra TODAS las actividades vivas, no solo la que esta en memoria.
 *
 * La version anterior salia temprano cuando `activity` era null, que es exactamente el estado despues
 * de que la app se reinicia — asi que la actividad de la sesion pasada nunca se cerraba y se iban
 * acumulando. Barrer por `getInstances()` no depende de que el proceso siga siendo el mismo.
 */
async function hideActivity() {
  activity = null;
  try {
    const { default: FocusActivity } = await import('@/widgets/focus-activity');
    await endStrays(FocusActivity);
  } catch {
    // Sin modulo nativo no hay nada que cerrar.
  }
}

/** Cierra las actividades huerfanas de sesiones pasadas. */
async function endStrays(factory: LiveActivityFactory<FocusActivityProps>) {
  try {
    // 'immediate': el bloque se acabo o se pauso, y dejarlo cuatro horas en la pantalla de bloqueo
    // convierte la Live Activity en basura que hay que barrer a mano.
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
