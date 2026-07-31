import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { User } from '@/features/auth/api';

import { refreshReminders } from './reminders';

/**
 * Deja los avisos locales al día: el recordatorio diario a la hora del perfil y un aviso diez
 * minutos antes de cada tarea con hora.
 *
 * Mismo molde y mismo momento que `use-widget-sync`, y por la misma razón: al entrar y cada vez que
 * la app vuelve al frente. Nada de polling. Reagendar es idempotente (identificadores fijos), así que
 * repetirlo no acumula — y es lo que hace que esto se auto-cure cuando alguien enciende los avisos en
 * Ajustes del sistema y vuelve.
 *
 * Hook aparte y no dentro de `use-widget-sync`: ese tiene un nombre que dice exactamente lo que hace
 * y una razón escrita para su cadencia; meterle notificaciones lo convierte en "haz todo al volver".
 *
 * **`hour` y `style` en las deps, no el objeto `user`.** Es lo que hace que cambiar la hora en el
 * perfil reagende en el acto sin que `auth-context` tenga que acordarse de llamar a nadie: el
 * `updateProfile` optimista repinta `user` en el mismo frame, el efecto se vuelve a correr y reagenda
 * sobre el identificador fijo. Y si el PATCH falla, el rollback repinta la hora vieja y reagenda de
 * vuelta, también gratis. Con `user` entero en las deps esto correría en cada cambio de cualquier
 * campo del perfil.
 */
export function useReminders(token: string | null, user: User | null, enabled: boolean) {
  const hour = user?.reminderHour ?? null;
  const style = user?.reminderStyle ?? null;

  useEffect(() => {
    if (!token || !enabled || hour == null || style == null) return;

    const run = () => void refreshReminders(token, hour, style);
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [token, enabled, hour, style]);
}
