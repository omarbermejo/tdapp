import TodayWidget, { type TodayWidgetProps } from '@/widgets/today-widget';

import { api, type Today } from '../auth/api';

/** El dia local del telefono, no el del servidor: el widget se ve aqui, no alla. */
export const localDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

const timeOf = (dueAt: string | null) =>
  dueAt
    ? new Date(dueAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : 'sin hora';

/** Aplana la respuesta a props primitivas: es lo unico que cruza al proceso del widget. */
export const toWidgetProps = (today: Today): TodayWidgetProps => ({
  nextTitle: today.next?.title ?? '',
  nextTime: today.next ? timeOf(today.next.dueAt) : '',
  pending: today.counts.pending,
  done: today.counts.done,
  running: today.running?.title ?? '',
});

/**
 * Empuja el dia al widget.
 *
 * ponytail: `updateSnapshot` y no `updateTimeline`. Una timeline solo sirve si sabemos
 * de antemano como se vera el widget en cada momento futuro, y aqui cualquier cambio
 * (completar algo, arrancar el cronometro) llega desde la app o desde otro dispositivo.
 * Techo: si el widget tiene que envejecer solo — tachar la tarea cuando pasa su hora —
 * ahi si toca una timeline con una entrada por vencimiento.
 *
 * Nunca lanza: que falle el widget no debe romper la pantalla que lo llamo.
 */
export async function syncTodayWidget(token: string) {
  try {
    TodayWidget.updateSnapshot(toWidgetProps(await api.today(token, localDate())));
  } catch (error) {
    if (__DEV__) console.warn('[widget] no se pudo actualizar', error);
  }
}
