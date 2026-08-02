import { createContext, use, type ReactNode } from 'react';
import { useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

/**
 * Cuánto hay que bajar antes de que la cápsula se aparte. En puntos de dedo, no de scroll.
 *
 * Un umbral es obligatorio: sin él, el rebote elástico de iOS al llegar arriba —que mueve el offset
 * unos puntos hacia abajo sin que nadie haya arrastrado nada— escondería la barra sola. Doce puntos
 * es menos de lo que mide una línea de texto, así que el gesto sigue sintiéndose inmediato.
 */
const THRESHOLD = 12;

/**
 * Por debajo de esto la barra vuelve SIEMPRE, aunque sigas bajando.
 *
 * Es el borde de arriba de la lista, donde esconder la navegación no compra nada: no hay contenido
 * que revelar todavía y la pantalla se lee vacía por abajo.
 */
const ALWAYS = 24;

/** Se aparta y vuelve sin sobrepaso: una barra que rebota al asomar se lee como un error. */
const SLIDE = { damping: 24, stiffness: 240 };

type Dock = {
  /** 0 = a la vista, 1 = apartada. La leen los estilos animados de la cápsula. */
  away: SharedValue<number>;
  /** Le pasas el offset vertical del scroll y decide. Es un worklet: corre en el hilo de UI. */
  onScroll: (y: number) => void;
  /** La devuelve a la vista. Al cambiar de pestaña, al enfocar una pantalla. */
  reveal: () => void;
};

const DockContext = createContext<Dock | null>(null);

/**
 * La cápsula de pestañas se aparta al bajar y vuelve al subir, en TODA la app.
 *
 * Vive en un contexto y no en cada pantalla por lo mismo que `FocusModeProvider`: quien sabe que
 * estás bajando es la lista, y quien pinta la barra es el layout del grupo — dos hermanos que no se
 * ven. La diferencia es que esto NO guarda estado de React: `away` es un shared value y el handler
 * es un worklet, así que un scroll de sesenta frames por segundo no provoca ni un render.
 *
 * La señal es la DIRECCIÓN, no la posición. Esconder por posición ("a partir de 200pt no hay barra")
 * deja la navegación inalcanzable en una lista larga sin subir hasta arriba del todo; por dirección,
 * un gesto corto hacia arriba la devuelve estés donde estés. Es lo que hacen Safari y Mail.
 */
export function DockProvider({ children }: { children: ReactNode }) {
  const away = useSharedValue(0);
  /** El último offset que decidió algo. No es "el último offset": ver el umbral. */
  const anchor = useSharedValue(0);

  const onScroll = (y: number) => {
    'worklet';
    // Arriba del todo la barra está siempre, y el ancla se reancla ahí para que el primer
    // arrastre hacia abajo cuente desde cero y no desde donde se quedó la vez anterior.
    if (y <= ALWAYS) {
      anchor.set(y);
      if (away.get() !== 0) away.set(withSpring(0, SLIDE));
      return;
    }

    const moved = y - anchor.get();
    if (Math.abs(moved) < THRESHOLD) return;
    anchor.set(y);

    const next = moved > 0 ? 1 : 0;
    if (away.get() !== next) away.set(withSpring(next, SLIDE));
  };

  const reveal = () => {
    away.set(withSpring(0, SLIDE));
    anchor.set(0);
  };

  /*
    El valor NO va en `useMemo`. Sus tres campos son estables por construcción — dos shared values y
    dos funciones que solo los tocan a ellos — así que memorizarlo sería envolver algo que ya no
    cambia. Lo que sí importa es que el proveedor no tenga estado: sin `useState` aquí dentro, nada
    de lo que hace el scroll llega a repintar el árbol.
  */
  return <DockContext value={{ away, onScroll, reveal }}>{children}</DockContext>;
}

/**
 * Devuelve un no-op sin proveedor, igual que `useFocusMode`.
 *
 * Es lo correcto: `useScrollVeil` lo llama desde CUALQUIER pantalla con scroll, y varias viven fuera
 * del grupo con pestañas (ajustes, cómo te ves, las de alta). Ahí no hay barra que apartar y la
 * pantalla tiene que funcionar igual.
 */
export function useDock(): Dock {
  return use(DockContext) ?? FALLBACK;
}

/**
 * El no-op de `onScroll` tiene que ser un WORKLET, y esto costo una pantalla entera.
 *
 * `useScrollVeil` lo llama desde dentro de `useAnimatedScrollHandler`, o sea desde el hilo de UI.
 * Llamar ahi una funcion de JS normal LANZA, y lo que se rompe no es un detalle: se cae el handler
 * completo y la pantalla deja de scrollear. Se vio en el detalle de un espacio — que es un push,
 * fuera del grupo con pestañas, o sea justo donde este fallback aplica.
 */
const noScroll = (_y: number) => {
  'worklet';
};

const FALLBACK: Dock = {
  /**
   * `away` solo lo LEE la capsula, y la capsula vive siempre dentro del proveedor: este valor falso
   * nunca llega a un worklet. Por eso basta con que cumpla el tipo.
   */
  away: { value: 0, get: () => 0, set: () => {} } as unknown as SharedValue<number>,
  onScroll: noScroll,
  reveal: () => {},
};
