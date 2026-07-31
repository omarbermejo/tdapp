import { useEffect, useState } from 'react';

import { localDate } from './api';

/**
 * Hoy en la zona del telefono, anclado en un efecto y nunca leido al pintar.
 *
 * El reloj en el render es impuro: dos renders del mismo estado darian dias distintos, y el
 * React Compiler lo rechaza con razon. El intervalo esta porque una app abierta pasada la
 * medianoche seguiria marcando hoy en el dia de ayer; el updater devuelve el MISMO valor cuando
 * no cambio, asi que despues del primer anclaje no provoca renders.
 *
 * Devuelve '' hasta que ancla: quien lo use no debe pintar numeros antes de eso, porque serian
 * inventados.
 */
export function useLocalToday() {
  const [today, setToday] = useState('');

  useEffect(() => {
    const tick = () => setToday((prev) => (prev === localDate() ? prev : localDate()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return today;
}

/**
 * Como se llama un dia cuando ya sabes en cual estas: 'Hoy', 'Mañana', 'Ayer' o 'Viernes 31'.
 *
 * Lo relativo primero porque es como habla la gente — nadie dice "el jueves 30" del dia en el
 * que esta parado. Mas alla de un dia de distancia el nombre del dia dice mas que "en 3 dias".
 */
export const dayLabel = (date: string, today: string) => {
  if (!date) return '';
  if (date === today) return 'Hoy';

  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d);

  if (today) {
    const [ty, tm, td] = today.split('-').map(Number);
    const diff = Math.round((at.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
  }

  const label = at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * La inicial del dia de la semana de una fecha 'YYYY-MM-DD': L M M J V S D.
 *
 * Sale de la locale y no de un array escrito a mano, que es la unica forma de que siga al idioma del
 * telefono. `es-MX` devuelve 'lun.' con punto, de ahi el replace.
 *
 * Se construye con numeros y no con `new Date(iso)`: parsear 'YYYY-MM-DD' lo trata como UTC, y al
 * oeste de Greenwich eso devuelve el dia anterior — la tira entera saldria corrida.
 */
export const weekdayInitial = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  const short = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short' });
  return short.replace('.', '').charAt(0).toUpperCase();
};
