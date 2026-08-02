import { useEffect } from 'react';
import { AppState } from 'react-native';

import { registerWidgetLayouts } from './register';
import { syncTodayWidget } from './sync-today';

/**
 * Mantiene el widget al dia.
 *
 * Se actualiza al entrar y cada vez que la app vuelve al frente: es el momento en que el
 * usuario acaba de mirar la pantalla de inicio, o sea justo cuando el widget importaba.
 * No hay polling — un widget que refresca en segundo plano gasta bateria para enseñar lo
 * mismo, y iOS ademas decide cuando dejarnos correr.
 */
export function useWidgetSync(token: string | null, enabled: boolean) {
  /**
   * Registrar los layouts va APARTE y SIN condiciones, y esa es toda la gracia.
   *
   * El sync de abajo necesita token y sesion lista; el registro no necesita nada, y sin el la
   * extension no tiene ni siquiera QUE pintar. Un usuario sin red, o recien instalado, o que nunca
   * abrio el cronometro, se encontraba baldosas vacias — ver `registerWidgetLayouts`.
   */
  useEffect(() => {
    void registerWidgetLayouts();
  }, []);

  useEffect(() => {
    if (!token || !enabled) return;

    syncTodayWidget(token);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncTodayWidget(token);
    });
    return () => sub.remove();
  }, [token, enabled]);
}
