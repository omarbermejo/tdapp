import type { FocusWidgetProps } from '@/widgets/focus-widget';

/**
 * Empuja el bloque de enfoque al widget.
 *
 * **Por que existe y no lee el almacen:** el bloque vive en SecureStore (`features/timer/vault.ts`) y la
 * extension NO lo ve — el layout se evalua en un JSContext cargado solo con el bundle de expo-widgets,
 * sin acceso al Keychain ni a nada de la app. Asi que el bloque tiene que cruzar el App Group como
 * props, igual que el resto de los widgets.
 *
 * **Lo que hace que valga la pena:** el widget pinta la cuenta atras con `Text(timerInterval:)`, que
 * SwiftUI actualiza SOLO. Por eso basta empujar el snapshot cuando el bloque CAMBIA de estado (empieza,
 * se pausa, se salta, acaba) y no cada segundo — que ademas seria imposible: WidgetKit da unos pocos
 * refrescos por hora.
 *
 * Nunca lanza, y el import es dinamico por lo mismo que el resto: `focus-widget.tsx` importa
 * `@expo/ui/swift-ui`, que revienta al cargarse en web.
 */

/** Lo que la pantalla del cronometro sabe del bloque. Es lo mismo que ya arma para la Live Activity. */
export type FocusSnapshot = {
  phase: string;
  resting: boolean;
  task: string;
  startedAt: number;
  endsAt: number;
  pausedAt: number;
  done: number;
  rounds: number;
  tint: string;
  tintDark: string;
};

async function push(entries: { date: Date; props: FocusWidgetProps }[]) {
  try {
    const { default: FocusWidget } = await import('@/widgets/focus-widget');
    FocusWidget.updateTimeline(entries);
  } catch (error) {
    if (__DEV__) console.warn('[widget] no se pudo actualizar el enfoque', error);
  }
}

/**
 * Cuando el bloque acaba, el widget deja de mentir SOLO.
 *
 * Con un snapshot suelto la cuenta atras llegaba a `0:00` y **se quedaba ahi para siempre** hasta que
 * alguien abriera la app — porque nadie estaba corriendo para avisar del final. `Text(timerInterval:)`
 * hace que el numero baje solo, pero no puede cambiar de estado: eso es un cambio de LAYOUT y el
 * layout solo cambia entre entradas de la timeline.
 *
 * Asi que se manda el futuro entero de una vez: ahora el bloque vivo, y en `endsAt` la invitacion a
 * empezar otro. WidgetKit cambia de entrada por su cuenta, con la app suspendida o muerta.
 *
 * En PAUSA no se programa nada: el reloj esta clavado, asi que `endsAt` ya no es cuando acaba. Una
 * entrada futura ahi apagaria un bloque que sigue esperandote.
 *
 * La entrada de relleno a las 12 horas no es adorno. Si TODAS las entradas quedan en el pasado,
 * WidgetKit vuelve a pedir la timeline, recibe lo mismo, y vuelve a pedirla — quemando el presupuesto
 * de refrescos del widget. Con un ancla en el futuro no hay bucle, y a las 12 horas la app ya se
 * abrio y empujo otra.
 */
export const showFocusWidget = (block: FocusSnapshot) => {
  const live: FocusWidgetProps = { live: true, ...block };
  const idle: FocusWidgetProps = { ...live, live: false };
  const now = Date.now();
  const entries = [{ date: new Date(now), props: live }];

  if (block.pausedAt === 0 && block.endsAt > now) {
    entries.push({ date: new Date(block.endsAt), props: idle });
    entries.push({ date: new Date(block.endsAt + 12 * 60 * 60_000), props: idle });
  }

  return push(entries);
};

/**
 * No hay bloque: el widget invita a empezar uno en vez de quedarse con el ultimo congelado.
 *
 * Los campos del tramo van en 0 y `live: false` los ignora. Mandar el ultimo bloque con `live: false`
 * seria peor: el layout no lo pintaria, pero el dato quedaria ahi para el siguiente que lea mal la
 * bandera.
 */
export const clearFocusWidget = (inks: { tint: string; tintDark: string }) =>
  push([
    {
      date: new Date(),
      props: {
        live: false,
        phase: 'Enfoque',
        resting: false,
        task: '',
        startedAt: 0,
        endsAt: 0,
        pausedAt: 0,
        done: 0,
        rounds: 0,
        ...inks,
      },
    },
  ]);
