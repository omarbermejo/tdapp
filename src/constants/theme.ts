// expo-router lleva react-navigation dentro y reexporta su tipo de tema.
import type { Theme as NavigationTheme } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

import { deriveRamp, isHex, normalizeHex } from './color';
import { getPreference, subscribe } from './scheme-store';

/**
 * Sistema visual: papel cálido, tinta verde profunda y acentos tierra.
 *
 * La armonía viene de Pace: fondo plano, tarjetas que se separan sin bordes gruesos, radios
 * generosos, jerarquía por tamaño y color de texto (no por cajas), y un solo CTA sólido por
 * pantalla.
 *
 * **El papel es blanco y la tarjeta también.** El crema a pantalla completa se leía como un tinte
 * sucio, así que el papel vuelve a blanco puro y lo que separa una tarjeta es SOLO su sombra
 * (`Elevation.raised`), nunca un escalón de valor ni un borde grueso. Es lo que ya decía el
 * sistema: el escalón de 1.07:1 que había antes no era lo que levantaba nada.
 *
 * La regla de temperatura sigue en pie para todo lo que NO es el papel: **una sola, y se hace
 * cumplir**. Un gris frío junto a los cremas de la marca se ve sucio, así que en modo claro no hay
 * grises neutros — todo neutro (lo hundido, la línea, la superficie de acento) es cálido.
 *
 * Regla: ningún hex vive fuera de este archivo. Los componentes consumen tokens, y los
 * de color SOLO a través de `useTheme()` / `useAccent()` — un import estático se
 * congelaría en el esquema que hubiera al cargar el módulo y no seguiría al sistema.
 */

/** Rampas completas de la marca. Solo se usan para derivar los tokens de abajo. */
export const Palette = {
  oliveLeaf: {
    DEFAULT: '#606c38',
    100: '#13160b',
    200: '#262b16',
    300: '#394121',
    400: '#4c562c',
    500: '#606c38',
    600: '#88994f',
    700: '#a9b876',
    800: '#c5d0a3',
    900: '#e2e7d1',
  },
  blackForest: {
    DEFAULT: '#283618',
    100: '#080b05',
    200: '#101509',
    300: '#18200e',
    400: '#1f2a13',
    500: '#283618',
    600: '#547133',
    700: '#80ac4d',
    800: '#aac987',
    900: '#d5e4c3',
  },
  cornsilk: {
    DEFAULT: '#fefae0',
    100: '#5d5103',
    200: '#baa206',
    300: '#f8dc27',
    400: '#fbeb84',
    500: '#fefae0',
    600: '#fefbe7',
    700: '#fefced',
    800: '#fffdf3',
    900: '#fffef9',
  },
  sunlitClay: {
    DEFAULT: '#dda15e',
    100: '#34210b',
    200: '#684216',
    300: '#9d6321',
    400: '#d1842c',
    500: '#dda15e',
    600: '#e4b57f',
    700: '#ebc79f',
    800: '#f1dabf',
    900: '#f8ecdf',
  },
  copperwood: {
    DEFAULT: '#bc6c25',
    100: '#251507',
    200: '#4b2b0f',
    300: '#704016',
    400: '#96561e',
    500: '#bc6c25',
    600: '#d98840',
    700: '#e3a570',
    800: '#ecc3a0',
    900: '#f6e1cf',
  },
  /**
   * Neutros CÁLIDOS del modo claro. Son todos los neutros que hay: ver la regla de temperatura
   * arriba.
   *
   * El orden va de la tarjeta hacia abajo, y el papel NO es el primer paso — es el segundo. Eso es
   * el cambio: lo que se levanta es blanco y lo que está detrás tiene cuerpo.
   *
   * Ninguno sale de la rampa `cornsilk`, que se va al amarillo saturado en cuanto baja
   * (`cornsilk[400]` ya es #fbeb84). Son el mismo crema desaturado, que es lo que deja bajar sin
   * ensuciarse.
   */
  paper: {
    /** El papel Y la tarjeta. Blanco puro: entre los dos no hay escalón, solo la sombra. */
    0: '#ffffff',
    /**
     * Crema apenas teñido. Ya NO es el papel — quedó para lo que necesita un fondo cálido sin
     * llegar al crema de marca (`sand`). Se mantiene porque `paper[100]` y `[200]` se derivan
     * visualmente de él y la rampa se leería rota sin este paso.
     */
    50: '#faf7ef',
    /** Lo hundido: chips sin seleccionar, pistas de progreso, avatares. `textMuted` encima da 6.7:1. */
    100: '#f1ede0',
    /** Hairline de 1pt. Un paso más abajo que lo hundido, para que un borde sobre relleno se vea. */
    200: '#e7e1d0',
  },
  /**
   * El crema de la marca. Ya no es la tarjeta: es la superficie de ACENTO — la tarjeta que quiere
   * decir "esto es distinto" (el hero del día, un bloque de sección), sin gastar el acento del
   * usuario, que tiene que quedar libre para el estado.
   */
  sand: {
    0: '#fefae0',
    100: '#f4ecc9',
    200: '#ece4bf',
  },
  /**
   * Neutros del modo oscuro. Son grises puros a proposito: derivar el fondo de la rampa
   * verde de la marca tiñe TODA la pantalla de verde, y el color de marca tiene que estar
   * en los acentos, no en el papel. El negro queda para el canvas y los grises levantan
   * las tarjetas.
   */
  carbon: {
    0: '#000000',
    900: '#141414',
    800: '#1f1f1f',
    700: '#2b2b2b',
    200: '#9c9c9c',
    100: '#f2f2f2',
  },
} as const;

/**
 * Tokens semánticos por esquema.
 *
 * El papel es blanco en claro y negro en oscuro. La tarjeta se separa sola y nunca con un
 * borde grueso: en claro por TEMPERATURA (el crema de la marca sobre el blanco), en oscuro
 * por luz (un gris sobre el negro).
 *
 * `ink` es el relleno del CTA y `onInk` su texto: se invierten entre esquemas, porque
 * un botón oscuro sobre fondo oscuro deja de ser el ancla de la pantalla.
 */
export type Scheme = 'light' | 'dark';

export type Tokens = {
  canvas: string;
  surface: string;
  /** La tarjeta que dice "esto es distinto", sin gastar el acento del usuario. */
  surfaceAlt: string;
  sunken: string;
  line: string;
  /**
   * El borde punteado. Es UNA regla para tres cosas que son la misma: la casilla sin marcar, el
   * hueco por llenar y el "agregar". Sale de Abode, donde el punteado dice "esto te espera" sin
   * gastar un icono ni una etiqueta.
   */
  dashed: string;
  text: string;
  textMuted: string;
  ink: string;
  inkPressed: string;
  onInk: string;
  /**
   * Cerrado. Existe aparte del acento porque "hecho" no puede depender del color que la persona
   * eligió en su perfil: con el acento puesto, una tarea cerrada y una tarea con área se pintaban
   * igual y la palomita dejaba de significar algo.
   */
  success: string;
  danger: string;
  /** Velo detras de una hoja o un dialogo: sin el no se lee que el resto quedo inactivo. */
  scrim: string;
};

const TOKENS: Record<Scheme, Tokens> = {
  light: {
    /** El papel: blanco puro. 12.6:1 con la tinta encima. */
    canvas: Palette.paper[0],
    /** La tarjeta: el mismo blanco. Se separa SOLO por sombra, nunca por escalón de valor. */
    surface: Palette.paper[0],
    /** El crema de la marca, ahora como superficie de acento. 12.2:1 con la tinta encima. */
    surfaceAlt: Palette.sand[0],
    /** Relleno apagado: pistas de progreso, chips sin seleccionar, avatares. */
    sunken: Palette.paper[100],
    /** Hairline de 1pt. Nunca bordes gruesos: el peso lo carga la tipografía. */
    line: Palette.paper[200],
    dashed: Palette.sand[200],

    text: Palette.blackForest[500],
    /**
     * Un paso por debajo de `oliveLeaf[500]`, que sobre blanco daba 5.6:1. Este da 7.7:1 y se queda
     * aunque el papel haya vuelto a blanco: el texto secundario también se lee sobre `surfaceAlt`
     * (el crema de marca), que es la superficie con menos luz de la app.
     */
    textMuted: Palette.oliveLeaf[400],

    ink: Palette.blackForest[500],
    inkPressed: Palette.blackForest[400],
    onInk: Palette.paper[0],

    /** 5.5:1 sobre el papel. Verde, no del acento: cerrar algo se ve igual para todo el mundo. */
    success: Palette.blackForest[600],
    /** 5.7:1 sobre el papel: el mensaje de error es justo el que hay que poder leer. */
    danger: Palette.copperwood[400],
    // Tinta de la marca al 40%, no negro puro: el velo tambien es de la paleta.
    scrim: 'rgba(40, 54, 24, 0.40)',
  },
  dark: {
    canvas: Palette.carbon[0],
    surface: Palette.carbon[900],
    surfaceAlt: Palette.carbon[800],
    sunken: Palette.carbon[800],
    line: Palette.carbon[700],
    dashed: Palette.carbon[700],

    text: Palette.carbon[100],
    textMuted: Palette.carbon[200],

    // El CTA se vuelve claro: sobre un canvas negro, lo sólido y luminoso es lo que pesa.
    ink: Palette.carbon[100],
    inkPressed: Palette.carbon[200],
    onInk: Palette.carbon[0],

    success: Palette.blackForest[800],
    /** 8.9:1 sobre negro; el copper medio se hunde en el fondo. */
    danger: Palette.copperwood[700],
    // Mas opaco que en claro: sobre un canvas negro un velo suave no separa nada.
    scrim: 'rgba(0, 0, 0, 0.60)',
  },
};

/**
 * Acentos del catálogo `accentColor` del backend.
 * - `solid`: relleno decorativo (muestras de color, formas). NUNCA texto.
 * - `soft`: tinte de chips y badges.
 * - `ink`: texto y bordes de estado — el único paso de cada acento que pasa AA (4.5:1)
 *   en 14-17pt sobre el fondo de SU esquema. Los medios (#dda15e, #80ac4d) se ven bien
 *   sobre blanco pero no se leen; en oscuro pasa al revés y hay que subir la rampa.
 */
export type Accent = { solid: string; soft: string; ink: string };

/** Los cinco de la marca. Sus tres pasos estan escritos a mano y MEDIDOS: ver los docstrings. */
export type BrandName = 'forest' | 'olive' | 'leaf' | 'clay' | 'copper';

/**
 * Todo lo que se puede pedir como acento.
 *
 * Tres familias y una sola puerta de entrada (`resolve`): los cinco de la marca, los seis derivados de
 * un color base, y el hex que teclea la persona en "Otro". Los dos ultimos comparten exactamente el
 * mismo derivador, asi que un color propio no es un caso especial — es el caso general con el nombre
 * puesto por quien lo eligio.
 */
export type AccentName = BrandName | ExtraName | `#${string}`;

const ACCENTS: Record<Scheme, Record<BrandName, Accent>> = {
  light: {
    forest: { solid: Palette.blackForest[500], soft: Palette.blackForest[900], ink: Palette.blackForest[500] },
    olive: { solid: Palette.oliveLeaf[500], soft: Palette.oliveLeaf[900], ink: Palette.oliveLeaf[400] },
    leaf: { solid: Palette.blackForest[700], soft: Palette.oliveLeaf[800], ink: Palette.blackForest[600] },
    clay: { solid: Palette.sunlitClay[500], soft: Palette.sunlitClay[900], ink: Palette.sunlitClay[300] },
    copper: { solid: Palette.copperwood[500], soft: Palette.copperwood[900], ink: Palette.copperwood[400] },
  },
  dark: {
    forest: { solid: Palette.blackForest[700], soft: Palette.blackForest[400], ink: Palette.blackForest[800] },
    olive: { solid: Palette.oliveLeaf[600], soft: Palette.oliveLeaf[200], ink: Palette.oliveLeaf[700] },
    /**
     * `leaf` sube un paso MÁS que `forest` en oscuro, y no es cosmético: los dos compartían
     * `solid` (#80ac4d) e `ink` (#aac987) exactos, así que en modo oscuro elegir Bosque u Hoja en el
     * selector de color del perfil no cambiaba nada visible — y ahí la repintada ES la confirmación
     * de que se guardó. Solo diferían en `soft`, que la muestra de color no usa.
     *
     * Medido sobre `surface` oscuro (#141414): #aac987 da 10.0:1 y #d5e4c3 13.8:1, así que los dos
     * pasan AA de sobra; y entre el `solid` de forest y el de leaf ahora hay 1.44:1, que es la
     * diferencia que hace que se lean como dos colores y no como uno repetido.
     */
    leaf: { solid: Palette.blackForest[800], soft: Palette.oliveLeaf[300], ink: Palette.blackForest[900] },
    clay: { solid: Palette.sunlitClay[500], soft: Palette.sunlitClay[200], ink: Palette.sunlitClay[600] },
    copper: { solid: Palette.copperwood[500], soft: Palette.copperwood[200], ink: Palette.copperwood[700] },
  },
};

/**
 * Los colores que NO son de la marca, cada uno con un solo color base.
 *
 * Se escriben con un hex y no con una rampa de nueve pasos porque no hacen falta: `deriveRamp` saca
 * los tres pasos del base y garantiza que `ink` pase AA, que es la unica propiedad que los cinco de
 * arriba consiguen a mano. Escribirlos como rampas seria inventarse cincuenta y cuatro hex que nadie
 * ha medido, y encima dejaria dos mecanismos distintos para el mismo concepto.
 *
 * Los tonos estan apagados a proposito. La paleta de la app es tierra —oliva, bosque, barro, cobre— y
 * un rosa o un lila a plena saturacion al lado de eso no se lee como "otro color de la misma familia",
 * se lee como un error. Todos rondan el 40-50% de saturacion.
 */
const EXTRAS = {
  rose: '#c17f86',
  lilac: '#9b8ec4',
  plum: '#7d5a6e',
  sky: '#6f92a8',
  teal: '#4e8c81',
  amber: '#c9962f',
} as const;

export type ExtraName = keyof typeof EXTRAS;

/** El papel sobre el que se mide el contraste de un acento derivado, por esquema. */
const SURFACE_OF: Record<Scheme, string> = {
  light: Palette.paper[0],
  dark: Palette.carbon[900],
};

/**
 * Las rampas derivadas, cacheadas por `esquema:color`.
 *
 * `deriveRamp` recorre hasta cincuenta pasos de luminosidad midiendo contraste en cada uno, y esto se
 * llama desde `useAccent`, o sea en CADA render de cada fila, cada chip y cada anillo. Sin la cache,
 * una lista de treinta tareas haria mil quinientas conversiones de color por frame.
 *
 * Un `Map` de modulo y no un `useMemo`: el resultado no depende del componente ni del ciclo de vida de
 * React —es una funcion pura de (color, esquema)— y compartirlo entre todos los consumidores es justo
 * lo que lo hace barato. Crece como mucho a dos entradas por color que la persona haya usado.
 */
const derived = new Map<string, Accent>();

/**
 * De un nombre a sus tres pasos. La UNICA puerta: `useAccent`, `accentOnDark` y `accentInks` entran
 * todas por aqui, y por eso admitir un color nuevo no obliga a tocar ni uno de sus consumidores.
 *
 * Lo desconocido cae en `olive` y no revienta, igual que antes. Es tolerancia a propósito: el acento
 * viaja por la red y puede llegar de una version de la app que tenga colores que esta no conoce.
 */
function resolve(scheme: Scheme, name?: string | null): Accent {
  const brand = ACCENTS[scheme][name as BrandName];
  if (brand) return brand;

  const base = (name && EXTRAS[name as ExtraName]) || (isHex(name) ? normalizeHex(name!) : null);
  if (!base) return ACCENTS[scheme].olive;

  const key = `${scheme}:${base}`;
  const hit = derived.get(key);
  if (hit) return hit;

  const ramp = deriveRamp(base, SURFACE_OF[scheme]);
  derived.set(key, ramp);
  return ramp;
}

/**
 * Nombres del catálogo, para pintar el selector de color sin depender del esquema.
 *
 * Los de la marca primero: son los que la app usa por defecto y los que llevan mas tiempo medidos.
 */
export const ACCENT_NAMES = [
  ...(Object.keys(ACCENTS.light) as BrandName[]),
  ...(Object.keys(EXTRAS) as ExtraName[]),
];

/**
 * El esquema en el que se pinta la app.
 *
 * Sale de dos cosas: lo que el teléfono dice y lo que la persona decidió en su perfil. La preferencia
 * manda; con `system` (el default) gana el teléfono. 'unspecified' (Android sin preferencia) cae en
 * claro.
 *
 * Los dos hooks re-renderizan solos: `useColorScheme` cuando el sistema cambia y
 * `useSyncExternalStore` cuando se toca el interruptor. Y de este hook cuelga TODO el color de la app
 * (`useTheme`, `useAccent`, `useShadow`, `useNavTheme`), así que cambiar la preferencia repinta la
 * pantalla entera sin que nadie más se entere de que existe un interruptor.
 */
export function useScheme(): Scheme {
  const system = useColorScheme();
  const preference = useSyncExternalStore(subscribe, getPreference, getPreference);
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Los tokens de color del esquema actual. Todo color de la UI sale de aquí. */
export function useTheme(): Tokens {
  return TOKENS[useScheme()];
}

/** Tolera acentos viejos o vacíos guardados en la base: nunca deja la UI sin color. */
export function useAccent(name?: string | null): Accent {
  return resolve(useScheme(), name);
}

/**
 * El acento como se lee sobre fondo OSCURO. No es un hook a propósito.
 *
 * Existe para lo que se pinta FUERA de la app. La pantalla de bloqueo y la Isla Dinámica son
 * SIEMPRE negras, en modo claro y en oscuro — y el `colorScheme` que recibe la extensión reporta
 * el del SISTEMA, así que en modo claro dice 'light' mientras te dibuja sobre negro. Resolver ahí
 * con `useAccent()` (o creerle al `colorScheme`) deja el paso oscuro sobre fondo oscuro: medido en
 * el simulador, el olive de modo claro daba 2.2:1 y la cuenta atrás desaparecía.
 *
 * Es `ink` de oscuro y no `solid`: `solid` es relleno decorativo y los acentos medios no llegan a
 * 4.5:1 ni en negro (fue lo que hizo que 'Enfoque' se viera apagado y 'Descanso' no).
 */
export function accentOnDark(name?: string | null): string {
  return resolve('dark', name).ink;
}

/**
 * Los DOS pasos legibles del acento, uno por esquema. Tampoco es un hook.
 *
 * Es el complemento de `accentOnDark`, y la diferencia importa: la pantalla de bloqueo y la Isla son
 * siempre negras, pero un widget de la pantalla de INICIO se dibuja sobre el material del sistema, que
 * sí sigue el claro/oscuro de verdad. Ahí el `colorScheme` que recibe la extensión no miente, así que
 * viajan los dos pasos y quien pinta elige.
 *
 * (En las familias `accessory*` — las de la pantalla de bloqueo — no se usa ninguno: el sistema pinta
 * todo monocromo y un color propio se ignora o se ve sucio.)
 */
export function accentInks(name?: string | null): { light: string; dark: string } {
  return { light: resolve('light', name).ink, dark: resolve('dark', name).ink };
}

/**
 * Las sombras solo existen en claro: en oscuro una sombra negra sobre fondo oscuro no se ve, y lo
 * que separa es el escalón de luz de `surface`.
 *
 * Son tres y antes era una, y ahora cargan aún más: con el papel de vuelta en blanco, la tarjeta y
 * el fondo son el MISMO color y la sombra es lo único que separa, así que tiene que decir a qué
 * altura está cada cosa. Y todas usan la tinta de la marca, nunca negro: una sombra negra junto a
 * los cremas de la marca los agrisa.
 */
export type Elevation = 'raised' | 'floating' | 'pressed';

export function useShadow(level: Elevation = 'raised') {
  return useScheme() === 'light' ? SHADOWS[level] : null;
}

const SHADOWS = {
  /**
   * La tarjeta apoyada en el papel. Sube de 0.07 a 0.10 al volver el papel a blanco: sin el
   * escalón de valor que había antes, con 0.07 la tarjeta se disolvía en el fondo.
   */
  raised: {
    shadowColor: Palette.blackForest[500],
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  /** Lo que flota POR ENCIMA del contenido y lo deja pasar por debajo: la barra, una hoja. */
  floating: {
    shadowColor: Palette.blackForest[500],
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  /** Hundido contra el papel mientras se mantiene el dedo. Corta y cerrada, o no se lee como tacto. */
  pressed: {
    shadowColor: Palette.blackForest[500],
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

/** Para que el navegador (fondos de transición, gestos) use el mismo papel que la app. */
export function useNavTheme(): NavigationTheme {
  const scheme = useScheme();
  const t = TOKENS[scheme];
  return {
    dark: scheme === 'dark',
    colors: {
      primary: ACCENTS[scheme].olive.solid,
      background: t.canvas,
      card: t.surface,
      text: t.text,
      border: t.line,
      notification: t.danger,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };
}

/** `xxl` es para lo que ocupa el ancho de la pantalla: el hero del día, una hoja. */
export const Radius = { sm: 4, md: 18, lg: 24, xl: 32, xxl: 40, pill: 999 } as const;

/** Ritmo vertical del diseño de referencia: pocos valores, muy espaciados. */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48, breath: 64 } as const;

/** Mínimo 44pt de área táctil (HIG); los controles primarios van más altos. */
export const Touch = { input: 56, button: 58, chip: 48, icon: 44 } as const;

/**
 * El ritmo de la app: UNA pareja de duraciones para todo lo que aparece y desaparece.
 *
 * Existe porque cada pieza traía su propio número (220 aquí, 240 allá) y eso es justo lo que hace
 * que una pantalla se sienta cosida en vez de diseñada. Los muelles NO están aquí a propósito: cada
 * uno tiene su argumento en el control que lo usa (seco para un toque, con rebote para una elección),
 * y unificarlos borraría esa diferencia.
 *
 * La salida es más corta que la entrada, y no es capricho: lo que llega pide atención, lo que se va
 * ya no la merece. Una salida tan larga como la entrada se lee como lentitud.
 */
export const Motion = {
  enter: 220,
  exit: 160,
  /** Escalón entre hermanos que entran en cascada (los siete días de la semana). */
  step: 30,
  /**
   * El tirón de una confirmación: la primera mitad de un `withSequence` que estira y suelta.
   *
   * Existe porque marcar una tarea usaba 90ms y cerrar el día 110ms para el MISMO gesto — la misma
   * palomita, dos velocidades. No es enter ni exit: no aparece nada, algo que ya estaba acusa el
   * golpe, y por eso es más corto que los dos.
   */
  pop: 100,
  /**
   * Un latido que no termina: el punto de "ahora" en la agenda. Es la única animación de la app que
   * no la dispara un gesto, así que va aparte — medirla con la escala de las que responden a un
   * toque la volvería un parpadeo.
   */
  pulse: 1400,
  /**
   * El rebote de "registré tu toque": el chip que se elige, el botón que confirma, la palomita que
   * se marca.
   *
   * Es la ÚNICA excepción a la regla de arriba, y por eso está aquí y no en cada control: los tres
   * hacían el mismo gesto con tres muelles distintos (220, 320 y 380 de rigidez, uno de ellos con
   * masa 0.6). No se unificó "el movimiento de la app" —el hundido del press sigue seco y la barra
   * del día sigue sin rebote, cada uno con su argumento— se unificó un gesto que estaba escrito tres
   * veces por accidente.
   *
   * ζ≈0.34: rebota lo justo para leerse como respuesta y no como gelatina.
   */
  confirm: { damping: 12, stiffness: 320 },
} as const;

/**
 * Cuatro roles, tres familias.
 *
 * `Serif` (Fraunces SemiBold) le pone CARA AL DÍA, y a nada más. Es el único lugar donde entra una
 * serif: el titular de Hoy. Sale de Tiimo, cuya app real pone una serif cálida en el título del día
 * y sans en el 100% de lo demás — es lo que hace que se lea como un objeto tranquilo y no como
 * software, y cuesta una familia y un peso. La regla que la acompaña es que **media adopción se ve
 * como error**: o el título entero o ninguno. Fraunces y no Recoleta porque Recoleta no es libre, y
 * de las que hay en Google Fonts es la que más se le parece (old-style cálida, terminaciones
 * suaves).
 *
 * `Display` (Outfit ExtraBold) grita: números y titulares. `Brand`/`BrandMedium` (Outfit 600/500)
 * son la voz de los CONTROLES — micro-rótulos, valores de pastilla, etiquetas de botón. Eso salía
 * en la fuente del sistema, y por eso el perfil se leía como una pantalla de Ajustes de iOS con
 * colores bonitos: la personalidad estaba solo en los tres números grandes de la pantalla.
 *
 * La PROSA se queda en la fuente del sistema (`body`, `hint`). No es pereza: San Francisco está
 * dibujada para leerse en cuerpo pequeño, con óptica por tamaño, y cambiarla pagaría legibilidad
 * por personalidad en el único texto que de verdad hay que leer. La regla queda: la app le pone
 * cara al día en Fraunces, habla en Outfit y explica en la del sistema.
 *
 * Cada estilo nombra su familia y NINGUNO lleva fontWeight: pedir un peso que la familia cargada
 * no tiene la tira a sans-serif en Android. Los cuatro pesos se cargan en `app/_layout.tsx`.
 */
export const Serif = 'Fraunces_600SemiBold';
export const Display = 'Outfit_800ExtraBold';
export const Brand = 'Outfit_600SemiBold';
export const BrandMedium = 'Outfit_500Medium';

export const Type = {
  /**
   * El día, y nada más. Grande porque es lo primero que se lee al abrir la app y porque una serif
   * a cuerpo chico pierde justo lo que la hace valer: el contraste de trazo.
   */
  day: { fontFamily: Serif, fontSize: 44, lineHeight: 50, letterSpacing: -0.5 },
  /**
   * El número de un día en la tira de la semana.
   *
   * Lleva la serif y eso NO rompe la regla de arriba, que es que Fraunces vive en UN sitio: es el
   * MISMO dato —el día— a otra escala, no un segundo uso de la serif. La tira y el titular de Hoy
   * cuentan la misma cosa (en qué día estás) con la misma voz, uno en grande y otro en pequeño; media
   * adopción se vería como error justo porque los dos hablan del día.
   *
   * `tabular-nums` porque el relleno del acento VIAJA de columna en columna: con figuras
   * proporcionales el 11 es más angosto que el 30 y el número bailaría dentro de su círculo al llegar.
   */
  dayNum: {
    fontFamily: Serif,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  display: { fontFamily: Display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  /** El número grande de una métrica: el hero del día, la racha, un total de Progreso. */
  hero: { fontFamily: Display, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  /**
   * La cuenta atrás del cronómetro, y nada más. Es el único número de la app que se lee a un
   * brazo de distancia — con el teléfono en la mesa mientras trabajas — así que se sale de la
   * escala a proposito: `display` a 34 dentro de un dial de 260 se lee como una etiqueta.
   *
   * `tabular-nums` porque los dígitos cambian cada segundo: con figuras proporcionales el '1'
   * es más angosto y el reloj entero se mueve al pasar de 10:00 a 09:59.
   */
  count: {
    fontFamily: Display,
    fontSize: 64,
    lineHeight: 68,
    letterSpacing: -1.5,
    // El cast es por el `as const` de abajo: sin el, el array queda readonly y RN pide uno mutable.
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  title: { fontFamily: Display, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  section: { fontFamily: Display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  metric: { fontFamily: Display, fontSize: 30, lineHeight: 34, letterSpacing: -0.4 },
  button: { fontFamily: Brand, fontSize: 17, lineHeight: 22 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  /** El valor de un control: lo que dice una pastilla o un chip. */
  label: { fontFamily: BrandMedium, fontSize: 15, lineHeight: 20 },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  /**
   * Micro-label en mayúsculas: es lo que ordena cada bloque sin agregar cajas.
   *
   * El tracking sube de 0.9 a 1.1 con el cambio de familia: Outfit es geométrica y sus mayúsculas
   * son más redondas y anchas que las de San Francisco, así que a 12pt se apiñaban con el valor
   * viejo. Es el ajuste que hace que "TU RACHA" se lea como un rótulo y no como una palabra.
   */
  micro: { fontFamily: Brand, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, textTransform: 'uppercase' },
} as const;
