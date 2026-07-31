// expo-router lleva react-navigation dentro y reexporta su tipo de tema.
import type { Theme as NavigationTheme } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

import { getPreference, subscribe } from './scheme-store';

/**
 * Sistema visual: papel blanco, tinta verde profunda y acentos tierra.
 *
 * La armonía viene del diseño de referencia (Pace): fondo plano, tarjetas que se separan
 * por un tono de luz en vez de bordes gruesos, radios generosos, jerarquía por tamaño y
 * color de texto (no por cajas), y un solo CTA sólido por pantalla.
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
   * Neutros del modo claro. Las rampas de marca solo van hacia el crema, y sobre blanco
   * un crema no separa nada: para levantar una tarjeta hay que bajar en gris, no subir
   * en amarillo.
   *
   * El papel de la app es el blanco puro de aqui, y no se toca. Lo que cambio es lo que se
   * levanta encima: eso ahora sale de `sand`.
   */
  paper: {
    0: '#ffffff',
    50: '#fafaf7',
    100: '#f1f1ea',
    200: '#e6e6dc',
  },
  /**
   * Neutros CÁLIDOS: la tarjeta y lo que se hunde dentro de ella.
   *
   * El papel de la app es blanco (`paper[0]`) y ahi se queda — eso es decision de Omar. Lo que
   * gana el crema de la marca (`cornsilk`, que existia en la paleta sin usarse en ningun sitio)
   * es la TARJETA: sobre blanco, un crema separa por temperatura en vez de por un gris, que era
   * lo que hacia que las tarjetas casi no se vieran.
   *
   * Los dos pasos de abajo no salen de la rampa `cornsilk` porque esa se va al amarillo saturado
   * en cuanto baja (`cornsilk[400]` ya es #fbeb84): son el mismo crema oscurecido, y sirven para
   * el relleno apagado y el hairline sin ensuciarse.
   */
  sand: {
    /** La tarjeta: el `cornsilk` de la marca, tal cual. */
    0: '#fefae0',
    /**
     * Lo hundido DENTRO de la tarjeta crema: chips sin seleccionar, pistas de progreso, avatares.
     *
     * El primer intento fue #f7f1d5 y era demasiado cerca del crema — los chips del perfil se leían
     * como fantasmas, solo por su borde. Este paso separa 0.131 de luminancia contra la tarjeta, o
     * sea un pelo MÁS que el par blanco/#f1f1ea de antes (0.123), así que el escalón que ya
     * funcionaba se mantiene. Y `textMuted` encima da 4.8:1, que pasa AA.
     */
    100: '#f4ecc9',
    /** Hairline. Un paso más abajo que lo hundido, para que un borde sobre relleno todavía se vea. */
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
  sunken: string;
  line: string;
  text: string;
  textMuted: string;
  ink: string;
  inkPressed: string;
  onInk: string;
  danger: string;
  /** Velo detras de una hoja o un dialogo: sin el no se lee que el resto quedo inactivo. */
  scrim: string;
};

const TOKENS: Record<Scheme, Tokens> = {
  light: {
    /** Blanco puro. El papel de la app no se discute. */
    canvas: Palette.paper[0],
    /** La tarjeta: el crema de la marca, que separa por temperatura y no por un gris. */
    surface: Palette.sand[0],
    /** Relleno apagado: pistas de progreso, chips sin seleccionar, avatares. */
    sunken: Palette.sand[100],
    /** Hairline de 1pt. Nunca bordes gruesos: el peso lo carga la tipografía. */
    line: Palette.sand[200],

    text: Palette.blackForest[500],
    textMuted: Palette.oliveLeaf[500],

    ink: Palette.blackForest[500],
    inkPressed: Palette.blackForest[400],
    onInk: Palette.paper[0],

    /** 6.9:1 sobre blanco: el mensaje de error es justo el que hay que poder leer. */
    danger: Palette.copperwood[400],
    // Tinta de la marca al 40%, no negro puro: el velo tambien es de la paleta.
    scrim: 'rgba(40, 54, 24, 0.40)',
  },
  dark: {
    canvas: Palette.carbon[0],
    surface: Palette.carbon[900],
    sunken: Palette.carbon[800],
    line: Palette.carbon[700],

    text: Palette.carbon[100],
    textMuted: Palette.carbon[200],

    // El CTA se vuelve claro: sobre un canvas negro, lo sólido y luminoso es lo que pesa.
    ink: Palette.carbon[100],
    inkPressed: Palette.carbon[200],
    onInk: Palette.carbon[0],

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
export type AccentName = 'forest' | 'olive' | 'leaf' | 'clay' | 'copper';

const ACCENTS: Record<Scheme, Record<AccentName, Accent>> = {
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

/** Nombres del catálogo, para pintar el selector de color sin depender del esquema. */
export const ACCENT_NAMES = Object.keys(ACCENTS.light) as AccentName[];

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
  const accents = ACCENTS[useScheme()];
  return accents[name as AccentName] ?? accents.olive;
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
  return (ACCENTS.dark[name as AccentName] ?? ACCENTS.dark.olive).ink;
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
  const key = name as AccentName;
  return {
    light: (ACCENTS.light[key] ?? ACCENTS.light.olive).ink,
    dark: (ACCENTS.dark[key] ?? ACCENTS.dark.olive).ink,
  };
}

/**
 * La sombra de tarjeta solo existe en claro: en oscuro una sombra negra sobre fondo
 * oscuro no se ve, y lo que separa es el escalón de luz de `surface`.
 */
export function useShadow() {
  return useScheme() === 'light' ? SHADOW_CARD : null;
}

const SHADOW_CARD = {
  shadowColor: Palette.blackForest[500],
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
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

export const Radius = { sm: 4, md: 18, lg: 24, xl: 32, pill: 999 } as const;

/** Ritmo vertical del diseño de referencia: pocos valores, muy espaciados. */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

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
} as const;

/**
 * Tres roles, dos familias.
 *
 * `Display` (Outfit ExtraBold) grita: números y titulares. `Brand`/`BrandMedium` (Outfit 600/500)
 * son la voz de los CONTROLES — micro-rótulos, valores de pastilla, etiquetas de botón. Eso salía
 * en la fuente del sistema, y por eso el perfil se leía como una pantalla de Ajustes de iOS con
 * colores bonitos: la personalidad estaba solo en los tres números grandes de la pantalla.
 *
 * La PROSA se queda en la fuente del sistema (`body`, `hint`). No es pereza: San Francisco está
 * dibujada para leerse en cuerpo pequeño, con óptica por tamaño, y cambiarla pagaría legibilidad
 * por personalidad en el único texto que de verdad hay que leer. La regla queda: la app habla en
 * Outfit y explica en la del sistema.
 *
 * Cada estilo nombra su familia y NINGUNO lleva fontWeight: pedir un peso que la familia cargada
 * no tiene la tira a sans-serif en Android. Los tres pesos se cargan en `app/_layout.tsx`.
 */
export const Display = 'Outfit_800ExtraBold';
export const Brand = 'Outfit_600SemiBold';
export const BrandMedium = 'Outfit_500Medium';

export const Type = {
  display: { fontFamily: Display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
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
