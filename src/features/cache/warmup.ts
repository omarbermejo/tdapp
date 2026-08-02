import { api } from '@/features/auth/api';
import { localDate } from '@/features/tasks/api';
import { workspacesApi } from '@/features/workspaces/api';
import { workspacesKey } from '@/features/workspaces/use-workspaces';

import { WARM, isStale, keyOf, revalidate } from './store';

/**
 * Calienta el cache con lo que el inicio va a pedir en cuanto se monte.
 *
 * **NO bloquea el arranque, y eso es la mitad del diseño.** Un splash que se queda dos segundos
 * esperando a la red se siente MAS lento que uno de trescientos milisegundos seguido de una pantalla
 * que carga — aunque el total sea el mismo. Asi que esto se dispara y se olvida: para cuando el
 * inicio monte, o los datos ya estan (y se pintan sin un solo hueco) o siguen en vuelo (y el hook
 * comparte esa misma peticion en vez de abrir otra, gracias a la deduplicacion del store).
 *
 * Lo que se precarga son las tres COMPARTIDAS: la racha, los espacios y las estadisticas del
 * trimestre. Las tres las pide el inicio nada mas montar y las tres sobreviven bien al TTL de cinco
 * minutos, asi que un segundo arranque en el mismo rato ni las toca.
 *
 * Lo que NO se precarga, a proposito: la lista de tareas del dia. Es lo mas volatil de la app, se
 * invalida con cada toque, y el inicio la pide igual — calentarla solo adelantaria una peticion que
 * va a repetirse.
 *
 * Que sea `isStale` quien decida evita el caso feo: abrir y cerrar la app cinco veces seguidas no
 * dispara quince peticiones, porque a la segunda ya no hay nada vencido.
 */
export function warmup(token: string) {
  const today = localDate();

  const jobs: [string, () => Promise<unknown>][] = [
    [keyOf('streak', today), () => api.streak(token, today)],
    [workspacesKey(), () => workspacesApi.list(token)],
    /*
      El trimestre del mapa de calor del inicio: 119 dias, ~5 KB. Es el payload mas grande de la app y
      el que mas se nota cuando falta, porque deja media pantalla en gris.
    */
    [keyOf('stats', today, 119), () => api.stats(token, { date: today, from: shift(today, -118) })],
  ];

  for (const [key, fetcher] of jobs) {
    if (!isStale(key, WARM)) continue;
    // Sin await y con el fallo tragado: esto es una ventaja, no un requisito. Si algo no llega, la
    // pantalla lo pide otra vez al montarse, que es exactamente lo de hoy.
    void revalidate(key, fetcher, WARM).catch(() => {});
  }
}

/**
 * `date` menos N dias, en ISO.
 *
 * Con el constructor de tres numeros y nunca `new Date('YYYY-MM-DD')`: ese lo lee como medianoche UTC
 * y al oeste de Greenwich devuelve el dia anterior. Misma trampa que documentan `day.ts` y `grid.ts`.
 */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
