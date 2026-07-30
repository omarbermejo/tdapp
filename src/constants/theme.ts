// expo-router lleva react-navigation dentro y reexporta su tipo de tema.
import type { Theme as NavigationTheme } from 'expo-router';

/**
 * Sistema visual: papel cálido, tinta verde profunda y acentos tierra.
 *
 * La armonía viene del diseño de referencia (Pace): fondo casi plano, tarjetas que se
 * levantan un tono en vez de llevar borde grueso, radios generosos, jerarquía por
 * tamaño y color de texto (no por cajas), y un solo CTA oscuro por pantalla.
 *
 * Regla: ningún hex vive fuera de este archivo. Los componentes consumen tokens.
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
} as const;

/**
 * Tokens semánticos. Las tarjetas son MÁS CLARAS que el canvas (papel sobre papel):
 * separar por luz en vez de por borde es lo que hace que la pantalla se sienta tranquila.
 */
export const Theme = {
  canvas: Palette.cornsilk[500],
  surface: Palette.cornsilk[800],
  /** Relleno apagado: pistas de progreso, chips sin seleccionar, avatares. */
  sunken: Palette.oliveLeaf[900],
  /** Hairline de 1pt. Nunca bordes gruesos: el peso lo carga la tipografía. */
  line: Palette.oliveLeaf[900],

  text: Palette.blackForest[500],
  textMuted: Palette.oliveLeaf[500],
  /** Texto sobre superficies oscuras. */
  onDark: Palette.cornsilk[500],

  /** Tinta del CTA principal. */
  ink: Palette.blackForest[500],
  inkPressed: Palette.blackForest[400],

  /** 5.5:1 sobre el papel: el mensaje de error es justo el que hay que poder leer. */
  danger: Palette.copperwood[400],
} as const;

/**
 * Acentos del catálogo `accentColor` del backend.
 * - `solid`: relleno decorativo (muestras de color, formas). NUNCA texto.
 * - `soft`: tinte de chips y badges.
 * - `ink`: texto y bordes de estado sobre papel — es el único paso de cada acento
 *   que pasa AA (4.5:1) en 14-17pt y 3:1 como indicador. Los medios (#dda15e, #80ac4d)
 *   se ven bien pero no se leen.
 */
export const Accents = {
  forest: { solid: Palette.blackForest[500], soft: Palette.blackForest[900], ink: Palette.blackForest[500] },
  olive: { solid: Palette.oliveLeaf[500], soft: Palette.oliveLeaf[900], ink: Palette.oliveLeaf[400] },
  leaf: { solid: Palette.blackForest[700], soft: Palette.oliveLeaf[800], ink: Palette.blackForest[600] },
  clay: { solid: Palette.sunlitClay[500], soft: Palette.sunlitClay[900], ink: Palette.sunlitClay[300] },
  copper: { solid: Palette.copperwood[500], soft: Palette.copperwood[900], ink: Palette.copperwood[400] },
} as const;

export type AccentName = keyof typeof Accents;
export type Accent = (typeof Accents)[AccentName];

/** Tolera acentos viejos o vacíos guardados en la base: nunca deja la UI sin color. */
export const accentOf = (name?: string | null): Accent =>
  Accents[name as AccentName] ?? Accents.olive;

export const Radius = { md: 18, lg: 24, xl: 32, pill: 999 } as const;

/** Ritmo vertical del diseño de referencia: pocos valores, muy espaciados. */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

/** Mínimo 44pt de área táctil (HIG); los controles primarios van más altos. */
export const Touch = { input: 56, button: 58, chip: 48, icon: 44 } as const;

/** Sombra única y muy suave, tintada con la tinta de la marca. */
export const Shadow = {
  card: {
    shadowColor: Palette.blackForest[500],
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
} as const;

/**
 * Titulares en Outfit ExtraBold: geométrica y de trazo grueso, la contraparte del display
 * del diseño de referencia. El texto de interfaz se queda en la fuente del sistema —
 * dos fuentes, una para gritar y otra para leer.
 *
 * Solo cargamos el peso 800, así que estos estilos NO llevan fontWeight: en Android
 * pedir un peso que la familia no tiene la tira a sans-serif.
 */
export const Display = 'Outfit_800ExtraBold';

export const Type = {
  display: { fontFamily: Display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: Display, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  section: { fontFamily: Display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  metric: { fontFamily: Display, fontSize: 30, lineHeight: 34, letterSpacing: -0.4 },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  hint: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  /** Micro-label en mayúsculas: es lo que ordena cada bloque sin agregar cajas. */
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
} as const;

/** Para que el navegador (fondos de transición, gestos) use el mismo papel que la app. */
export const NavTheme: NavigationTheme = {
  dark: false,
  colors: {
    primary: Accents.olive.solid,
    background: Theme.canvas,
    card: Theme.surface,
    text: Theme.text,
    border: Theme.line,
    notification: Theme.danger,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' },
  },
};
