import { bearer, request, type Task } from '@/features/auth/api';

import { canNotify, ensureChannel, ensureHandler, type NotificationsModule } from './local';

/**
 * Los avisos locales que la app venía prometiendo sin cumplir: el recordatorio diario a la hora del
 * perfil y un aviso antes de cada tarea con hora.
 *
 * El onboarding pregunta "¿A qué hora te escribo?" desde el primer día, el API guarda
 * `reminder_hour` y el perfil lo deja editar — y nada lo agendaba nunca. Igual con `dueAt`: se
 * guardaba, se pintaba en la agenda, y no disparaba nada.
 *
 * ponytail: SOLO avisos locales. No hay push desde el servidor y no hace falta, porque un aviso
 * local sobrevive a que la app se cierre y no cuesta infraestructura. Hasta hoy `register-device.ts`
 * pedía el permiso, leía `extra.eas.projectId` de un `app.json` que nunca lo tuvo, y salía siempre
 * por `return 'unsupported'` sin registrar nada: `POST /me/devices` y la tabla `devices` del API
 * llevan vacías desde el primer día. Se borró el registro y se quedó el permiso, que es la mitad que
 * sí hacía falta.
 * Techo: el push del servidor se gana cuando exista algo que el teléfono NO pueda saber al agendar.
 * Dos casos reales: un aviso que nombre tu próxima tarea (el texto se congela al agendar, ver abajo)
 * y cualquier cosa que dependa de otro dispositivo. Ese día: vincular a EAS, `projectId` en
 * `extra.eas`, `remote-notification` en `UIBackgroundModes`, resucitar `POST /me/devices` — y un
 * scheduler en el API, que es la parte cara.
 *
 * ponytail: tocar un aviso abre la app donde la dejaste, y nadie escucha la respuesta. Techo: hace
 * falta una ruta de UNA tarea (hoy no existe: `new-task` crea y `calendar` pinta un día), y ahí entra
 * `addNotificationResponseReceivedListener` más `getLastNotificationResponseAsync` para el arranque
 * en frío — retenido hasta que `stage === 'ready'`, porque antes de eso los `Stack.Protected` de
 * `_layout.tsx` se comen la navegación.
 */

/** Todo lo nuestro empieza por aquí, y es lo único que `clearReminders` se atreve a cancelar. */
const PREFIX = 'tdapp-remind-';
const DAILY_ID = `${PREFIX}daily`;
const taskAlertId = (id: number) => `${PREFIX}task-${id}`;

/** El canal que `register-device.ts` creaba y nadie usaba. Ahora tiene algo dentro. */
const CHANNEL = 'reminders' as const;

/** Cuánto antes de la hora avisa. Fijo: una antelación por tarea es un ajuste que nadie pidió. */
const LEAD_MS = 10 * 60_000;

/** Hasta dónde se mira. Más allá de una semana, reagendar en cada arranque ya lo cubre. */
const HORIZON_MS = 7 * 24 * 60 * 60_000;

/**
 * Techo explícito.
 *
 * iOS solo guarda las **64 pendientes más próximas** por app y descarta el resto en silencio. De
 * esas, hasta tres son de otros: el diario, la alarma del cronómetro y el cartel fijo de Android.
 * Quedan 61, redondeado a 60.
 *
 * Lo que se cae al pasarse son siempre las más lejanas, y eso es correcto por construcción:
 * `?status=pending` llega ordenado por `due_at` ascendente (`task-repository.js`), así que el
 * `slice` conserva hoy y mañana. Y como esto se reagenda entero en cada vuelta al frente, la número
 * 61 entra sola en cuanto la 1 suena.
 */
const CAP = 60;

/**
 * El cuerpo del recordatorio diario lo elige `reminderStyle`.
 *
 * Se usa ese dato —que hasta hoy era inerte de punta a punta— porque la pastilla del perfil ya dice
 * "Firme · 9 am": la app **ya afirma** que el tono importa, y tres líneas lo vuelven cierto. El
 * molde es el `PHASES` de la pantalla del cronómetro.
 *
 * ponytail: cambia el TONO, no la insistencia. "Insistente" honestamente significa repetir, y
 * repetir es un segundo aviso condicionado a si marcaste algo — o sea scheduling que depende del
 * estado del día, no un string. Techo: cuando eso exista, entra aquí.
 */
const NUDGE: Record<string, string> = {
  gentle: 'Elige una cosa. Con eso basta.',
  firm: 'Una cosa, ahora. Elígela y arranca.',
  persistent: 'Otra vez yo. Elige una y arranca.',
};

/**
 * El recordatorio diario, con identificador fijo.
 *
 * Fijo y no cancelar-y-reagendar: `UNUserNotificationCenter.add` con el mismo identifier reemplaza,
 * así que reagendar es idempotente y no puede dejar dos sonando. Cancelar primero abriría una
 * ventana en la que no hay nada agendado, y un `await` que puede fallar a medias.
 *
 * El trigger `DAILY` repite **sin que la app corra** y en iOS se traduce a un
 * `UNCalendarNotificationTrigger` sin zona, o sea contra el calendario local del teléfono: te vas a
 * otro país y suena a las 9 de allá. Es justo lo que necesita un `reminderHour` que es un entero sin
 * zona. Y cuenta como UNA sola pendiente frente al techo de 64.
 */
async function scheduleDaily(N: NotificationsModule, hour: number, style: string) {
  await N.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: {
      title: '¿Qué sigue hoy?',
      body: NUDGE[style] ?? NUDGE.gentle,
      sound: true,
      /**
       * Sin `interruptionLevel`. Un recordatorio de rutina diaria es exactamente lo que el resumen
       * programado de iOS existe para agrupar; atravesarlo sería el regaño que el onboarding promete
       * no dar. El aviso de tarea sí lo lleva, porque ese sí caduca.
       *
       * Y este aviso NO puede nombrar tu próxima tarea: el texto se congela al agendar y el DAILY
       * repite para siempre — se agenda hoy y suena mañana. Es el mismo argumento por el que el
       * cartel de Android dice la hora de fin y no una cuenta atrás.
       */
      data: { kind: 'tdapp.remind.daily' },
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      channelId: CHANNEL,
      hour,
      // `REMINDER_HOUR` solo ofrece horas en punto, y el tipo exige el minuto.
      minute: 0,
    },
  });
}

/**
 * Un aviso diez minutos antes de cada tarea pendiente con hora, dentro de la ventana.
 *
 * Reagenda desde cero y sin diffing: comparar la fecha del trigger pendiente contra la deseada sería
 * exactamente el estado duplicado que el identificador fijo existe para no tener. Lo que sí hace
 * falta es la pasada de huérfanos, porque reagendar reemplaza pero no borra lo que ya no debe existir
 * — que es el caso de marcar una tarea como hecha.
 */
async function scheduleTaskAlerts(N: NotificationsModule, tasks: Task[]) {
  const now = Date.now();

  const wanted = tasks
    .filter((task) => {
      if (!task.dueAt) return false;
      const due = Date.parse(task.dueAt);
      /**
       * Que el aviso caiga en el FUTURO es obligatorio, no higiene. En iOS un trigger `DATE` se
       * convierte a `UNTimeIntervalNotificationTrigger(timeInterval: date.timeIntervalSinceNow)`; con
       * una fecha pasada el intervalo es negativo, Apple lanza, `catchException` se lo traga y el
       * trigger queda en `nil` — y un request sin trigger **se entrega inmediatamente**. Sin esta
       * guarda, abrir la app con tareas vencidas suelta una ráfaga de avisos falsos.
       *
       * De paso, una tarea creada para dentro de tres minutos no recibe aviso: acabas de escribirla.
       */
      return due - LEAD_MS > now && due <= now + HORIZON_MS;
    })
    .slice(0, CAP);

  // Los que ya no deben existir. Solo se miran los nuestros de tarea: el diario tiene su propio id,
  // y la alarma del cronometro no es asunto de este archivo.
  const keep = new Set(wanted.map((task) => taskAlertId(task.id)));
  const live = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    live
      .filter((row) => row.identifier.startsWith(`${PREFIX}task-`) && !keep.has(row.identifier))
      .map((row) => N.cancelScheduledNotificationAsync(row.identifier))
  );

  for (const task of wanted) {
    const due = Date.parse(task.dueAt!);
    await N.scheduleNotificationAsync({
      identifier: taskAlertId(task.id),
      content: {
        title: task.title,
        // La HORA y no "en diez minutos": la hora sigue siendo cierta si el aviso se lee media hora
        // tarde. Mismo argumento que el cartel fijo de Android.
        body: `Arranca a las ${new Date(due).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}.`,
        sound: true,
        // Un "empieza en diez minutos" leido despues no sirve de nada. (Mismo techo del entitlement
        // que `timer/alarm.ts`: hoy iOS lo degrada a `active`.)
        interruptionLevel: 'timeSensitive',
        data: { kind: 'tdapp.remind.task' },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        channelId: CHANNEL,
        date: due - LEAD_MS,
      },
    });
  }
}

/**
 * Deja todos los avisos al día. Idempotente: repetirla no acumula nada.
 *
 * NUNCA lanza, y el import va dentro del `try` por lo mismo que en `timer/alarm.ts`: en un binario
 * sin el módulo nativo compilado, cargar expo-notifications revienta.
 */
export async function refreshReminders(token: string, hour: number, style: string) {
  try {
    const N = await import('expo-notifications');
    ensureHandler(N);
    await ensureChannel(N, CHANNEL);
    // Sin `ask`: un dialogo del sistema al arrancar la app, salido de nada, es peor que no tener
    // recordatorio. Y se auto-cura — si lo enciende en Ajustes, al volver a la app esto reagenda.
    if (!(await canNotify(N))) return;

    await scheduleDaily(N, hour, style);

    // La peticion va cruda y NO por `tasksApi.list`: ese modulo llama aqui desde `andSync`, asi que
    // pasar por el crearia un ciclo de imports. `auth/api.ts` no depende de nadie.
    // Sin `date` a proposito: hacen falta siete dias, y `/me/today` solo sabe de uno.
    const { tasks } = await request<{ tasks: Task[] }>('/tasks?status=pending', {
      headers: bearer(token),
    });
    await scheduleTaskAlerts(N, tasks);

    if (__DEV__) {
      const live = await N.getAllScheduledNotificationsAsync();
      console.log('[avisos]', live.map((row) => row.identifier));
    }
  } catch {
    // Sin avisos la app funciona entera. No hay nada que reportar hacia arriba.
  }
}

/**
 * Reagenda solo los avisos de tarea, sin volver a tocar el diario. Lo llama `andSync` tras cada
 * mutación de tareas.
 */
export async function refreshTaskAlerts(token: string) {
  try {
    const N = await import('expo-notifications');
    // El handler y el canal se repiten aqui aunque `refreshReminders` ya los haya puesto al montar.
    // Los dos son idempotentes, y sin esto esta funcion solo seria correcta si la otra corrio antes
    // — una dependencia de orden que nada obliga a cumplir, y que en Android acabaria mandando los
    // avisos de tarea a un canal por defecto silencioso.
    ensureHandler(N);
    await ensureChannel(N, CHANNEL);
    if (!(await canNotify(N))) return;

    const { tasks } = await request<{ tasks: Task[] }>('/tasks?status=pending', {
      headers: bearer(token),
    });
    await scheduleTaskAlerts(N, tasks);
  } catch {
    // Igual que arriba: en silencio.
  }
}

/**
 * Cancela lo nuestro al cerrar sesión.
 *
 * Es obligatorio y no cortesía: un `DAILY` repite **para siempre** sin que la app corra, así que sin
 * esto una cuenta cerrada seguiría recibiendo "¿Qué sigue hoy?" hasta que alguien desinstale la app.
 *
 * Filtra por prefijo y **nunca** llama `cancelAllScheduledNotificationsAsync()`: eso se llevaría la
 * alarma de un bloque de cronómetro que puede estar corriendo, y el cartel fijo de Android.
 */
export async function clearReminders() {
  try {
    const N = await import('expo-notifications');
    const live = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      live
        .filter((row) => row.identifier.startsWith(PREFIX))
        .map((row) => N.cancelScheduledNotificationAsync(row.identifier))
    );
  } catch {
    // Sin modulo nativo no hay nada agendado que cancelar.
  }
}
