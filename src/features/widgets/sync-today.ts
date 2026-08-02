import { accentInks } from '@/constants/theme';
import type { CaptureWidgetProps } from '@/widgets/capture-widget';
import type { StreakWidgetProps } from '@/widgets/streak-widget';
import { short, timeOf } from '@/widgets/shared';
import type { TodayWidgetProps } from '@/widgets/today-widget';

import { api, type Streak, type Today } from '../auth/api';

/** El dia local del telefono, no el del servidor: el widget se ve aqui, no alla. */
export const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

/** Cuantas pendientes se listan en el widget grande. Tres: mas seria la lista que el widget evita. */
const SOON = 3;

/**
 * La proxima medianoche LOCAL, que es cuando el dia de hoy deja de ser hoy.
 *
 * `setHours(24, ...)` y no sumar 86_400_000: con cambio de horario un dia no dura 24 horas, y en el
 * de octubre el widget se quedaria una hora enseñando el dia de ayer.
 */
const nextMidnight = () => {
  const at = new Date();
  at.setHours(24, 0, 0, 0);
  return at;
};

/** Aplana la respuesta a props primitivas: es lo unico que cruza al proceso del widget. */
export const toWidgetProps = (today: Today): TodayWidgetProps => {
  const inks = accentInks(today.user.accentColor);
  // Las que vienen DESPUES de la siguiente: la primera ya es el titular del widget.
  const soon = today.tasks.filter((task) => task.status === 'pending' && task.id !== today.next?.id);

  return {
    nextTitle: today.next?.title ?? '',
    nextTime: today.next ? timeOf(today.next.dueAt) || 'sin hora' : '',
    pending: today.counts.pending,
    done: today.counts.done,
    running: today.running?.title ?? '',
    soonTitles: soon.slice(0, SOON).map((task) => short(task.title, 28)),
    soonTimes: soon.slice(0, SOON).map((task) => timeOf(task.dueAt)),
    tint: inks.light,
    tintDark: inks.dark,
  };
};

export const toCaptureProps = (today: Today): CaptureWidgetProps => {
  const inks = accentInks(today.user.accentColor);
  return { pending: today.counts.pending, tint: inks.light, tintDark: inks.dark };
};

/**
 * Las iniciales de lunes a domingo. Se resuelven AQUI y viajan como dato: el layout corre en un
 * JSContext pelado dentro de la extension, sin la locale del usuario y sin `Intl`.
 */
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const toStreakProps = (streak: Streak, accent: string | null): StreakWidgetProps => {
  const inks = accentInks(accent);
  return {
    days: streak.days,
    best: streak.best,
    week: streak.week.map((day) => day.done),
    labels: WEEKDAYS,
    // El API manda la semana de lunes a domingo, asi que el indice de hoy sale de comparar la fecha.
    todayIndex: streak.week.findIndex((day) => day.date === streak.date),
    tint: inks.light,
    tintDark: inks.dark,
  };
};

/**
 * Empuja el dia a los widgets.
 *
 * ponytail: `updateSnapshot` y no `updateTimeline`. Una timeline solo sirve si sabemos de antemano como
 * se vera el widget en cada momento futuro, y aqui cualquier cambio (completar algo, arrancar el
 * cronometro) llega desde la app o desde otro dispositivo. Techo: si el widget tiene que envejecer solo
 * — tachar la tarea cuando pasa su hora, o cambiar de dia a medianoche — ahi si toca una timeline con
 * una entrada por vencimiento. (Y ojo: `updateSnapshot` ES `updateTimeline([{now, props}])`, no hay
 * ruta rapida que se salte la timeline.)
 *
 * Los imports de los widgets son DINAMICOS y no de valor arriba: cada uno importa `@expo/ui/swift-ui`,
 * que llama `requireNativeView` en el AMBITO DEL MODULO, y en web eso es un `throw new
 * UnavailabilityError` sin condiciones. Con imports estaticos, cargar este archivo reventaba la app
 * entera en web al arrancar (la cadena era `app/_layout.tsx` -> `use-widget-sync` -> aqui). Los tipos si
 * entran arriba: `import type` los borra TypeScript y no cargan nada.
 *
 * Las dos peticiones van en paralelo y cada widget se actualiza con lo que HAYA llegado: que se caiga
 * el endpoint de racha no puede dejar el widget del dia sin refrescar, y al contrario tampoco. Cada una
 * se pide UNA vez y se reparte — el acento sale de `/me/today`, asi que la racha lo aprovecha en vez de
 * volver a preguntar.
 *
 * Nunca lanza: que falle un widget no debe romper la pantalla que lo llamo.
 */
export async function syncTodayWidget(token: string) {
  const date = localDate();

  const [today, streak] = await Promise.all([
    api.today(token, date).catch((error) => {
      if (__DEV__) console.warn('[widget] no se pudo traer el dia', error);
      return null;
    }),
    api.streak(token, date).catch((error) => {
      if (__DEV__) console.warn('[widget] no se pudo traer la racha', error);
      return null;
    }),
  ]);

  try {
    if (today) {
      const [{ default: TodayWidget }, { default: CaptureWidget }] = await Promise.all([
        import('@/widgets/today-widget'),
        import('@/widgets/capture-widget'),
      ]);
      /*
        Tres entradas y no una, y esa es la diferencia entre un widget vivo y uno congelado.

        `updateSnapshot` es literalmente `updateTimeline([{ ahora, props }])`, y WidgetKit la sirve
        con `policy: .atEnd`: con una sola entrada ya en el PASADO, vuelve a pedir la timeline,
        recibe la misma entrada vieja y repinta igual. Nada envejece solo — ni el cambio de dia a
        medianoche. `sync-focus` ya resolvio esto y lo argumento por escrito; Today y Capture no
        heredaron el patron.

        A medianoche se ponen en CERO: el dia cambio, y enseñar el de ayer es peor que enseñar vacio.
        La entrada de +12h es el ancla — una timeline entera en el pasado quema el presupuesto de
        refrescos de WidgetKit, o sea que congela el widget MAS, no menos.
      */
      const midnight = nextMidnight();
      const anchor = new Date(midnight.getTime() + 12 * 3_600_000);
      /** El dia siguiente, todavia sin pedir: cero tareas y ningun titular, con el mismo acento. */
      const empty: TodayWidgetProps = {
        ...toWidgetProps(today),
        nextTitle: '',
        nextTime: '',
        pending: 0,
        done: 0,
        running: '',
        soonTitles: [],
        soonTimes: [],
      };

      TodayWidget.updateTimeline([
        { date: new Date(), props: toWidgetProps(today) },
        { date: midnight, props: empty },
        { date: anchor, props: empty },
      ]);
      CaptureWidget.updateTimeline([
        { date: new Date(), props: toCaptureProps(today) },
        { date: midnight, props: { ...toCaptureProps(today), pending: 0 } },
        { date: anchor, props: { ...toCaptureProps(today), pending: 0 } },
      ]);
    }

    if (streak) {
      const { default: StreakWidget } = await import('@/widgets/streak-widget');
      // Sin `today` el acento cae en el default de `accentInks`, que es el mismo olive de la app.
      const props = toStreakProps(streak, today?.user.accentColor ?? null);
      /*
        La racha NO se pone en cero a medianoche, a diferencia de las otras dos: el API es explicito
        en que hoy sin cerrar nada no la rompe. Solo necesita el ancla futura para que WidgetKit no
        se quede reintentando contra una timeline entera en el pasado.
      */
      StreakWidget.updateTimeline([
        { date: new Date(), props },
        { date: new Date(nextMidnight().getTime() + 12 * 3_600_000), props },
      ]);
    }
  } catch (error) {
    if (__DEV__) console.warn('[widget] no se pudo pintar', error);
  }
}
