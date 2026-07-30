import { Platform } from 'react-native';

/**
 * Sistema visual pensado para TDAH: fondo profundo, acentos saturados,
 * bordes gruesos y tipografia grande. Alto contraste = menos esfuerzo para enfocar.
 */
export const Brand = {
  ink: '#12102A',
  inkSoft: '#1E1B44',
  inkLine: '#3B3480',
  text: '#FFFFFF',
  textMute: '#A9A2E0',
  danger: '#FF4D6D',
  shadow: '#07061A',
} as const;

/** Coincide con el catalogo accentColor del backend. */
export const Accents = {
  electric: '#7B5CFF',
  lime: '#C6FF3D',
  mango: '#FF9D2E',
  magenta: '#FF3D8B',
  turquoise: '#1EE0C6',
} as const;

export type AccentName = keyof typeof Accents;

/** Texto legible sobre cada acento (los claros piden tinta oscura). */
export const onAccent = (accent: AccentName) =>
  accent === 'lime' || accent === 'mango' || accent === 'turquoise' ? Brand.ink : Brand.text;

export const Radius = { sm: 14, md: 20, lg: 28, pill: 999 } as const;

/** Nada por debajo de 56pt: los toques imprecisos no deben castigar al usuario. */
export const Touch = { input: 62, button: 66, chip: 56 } as const;

export const Display = Platform.select({ ios: 'ui-rounded', default: undefined });

export const Type = {
  hero: { fontFamily: Display, fontSize: 40, lineHeight: 44, fontWeight: '800' },
  title: { fontFamily: Display, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  label: { fontFamily: Display, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '500' },
  button: { fontFamily: Display, fontSize: 20, fontWeight: '800' },
  hint: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
} as const;
