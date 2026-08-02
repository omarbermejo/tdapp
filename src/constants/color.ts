/**
 * Aritmetica de color. Puro, sin React y sin tokens: no sabe nada de la app.
 *
 * Existe porque el catalogo de acentos dejo de ser cerrado. Los cinco de la marca siguen escritos a
 * mano en `theme.ts` con sus tres pasos MEDIDOS —hay contrastes anotados en sus docstrings— pero los
 * colores nuevos y, sobre todo, el que teclea la persona en "Otro" no pueden tener rampa a mano. Este
 * modulo la deriva, y lo hace con la MISMA regla que cumplen los cinco originales: `ink` pasa AA.
 *
 * Vive aparte de `theme.ts` a proposito. Ese archivo importa de `expo-router` y de React, y esto es
 * matematica que tiene que poder correr en cualquier sitio —un test, un script de build— sin arrastrar
 * medio Expo detras. Tampoco tiene ni un hex propio: el papel sobre el que se mide llega por parametro,
 * que es lo que mantiene en pie la regla de que el color de la app vive en un solo archivo.
 */

/** Lo minimo que la app entiende por acento. Igual que `Accent` en `theme.ts`, sin importarlo. */
export type Ramp = { solid: string; soft: string; ink: string };

/** `#rrggbb` o `#rgb`. Es lo que se acepta en el campo de "Otro" y lo que se guarda en la base. */
export const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHex = (value?: string | null): value is string => !!value && HEX.test(value.trim());

/**
 * Normaliza a `#rrggbb` en minusculas.
 *
 * Acepta el atajo de tres digitos porque la gente lo teclea (`#f0a`), y lo expande duplicando cada
 * digito, que es lo que dice CSS. Sin esto, `#f0a` y `#ff00aa` serian dos claves distintas de la cache
 * y dos filas distintas en la base para el mismo color.
 */
export const normalizeHex = (value: string): string => {
  const raw = value.trim().toLowerCase();
  const body = raw.slice(1);
  return body.length === 3 ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}` : raw;
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

const toRgb = (hex: string): Rgb => {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

/**
 * Luminancia relativa segun WCAG 2.
 *
 * El tramo lineal por debajo de 0.03928 no es un detalle que se pueda saltar: sin el, los colores muy
 * oscuros salen con luminancia negativa y el contraste contra negro da absurdos.
 */
const luminance = ({ r, g, b }: Rgb): number => {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

/** El cociente de WCAG: 1 (identicos) a 21 (negro sobre blanco). AA en texto normal pide 4.5. */
/**
 * Un punto intermedio entre dos colores, en RGB lineal simple.
 *
 * Existe para la RAMPA del mapa de calor del widget: alli los pasos hay que cocinarlos en la app
 * —el layout corre en un JSContext pelado y no puede resolver colores— asi que hace falta poder
 * pedir "el 40% del camino de soft a solid".
 *
 * En RGB y no en HSL a proposito: los dos extremos ya salen de la misma rampa, o sea que comparten
 * tono y solo se separan en luz y saturacion. Interpolar en HSL ahi no compra nada y puede cruzar
 * el circulo de tono por el lado largo si los hex se redondearon distinto.
 */
export const mixHex = (from: string, to: string, at: number): string => {
  const a = toRgb(from);
  const b = toRgb(to);
  const t = Math.min(Math.max(at, 0), 1);
  return toHex({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
};

export const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(toRgb(a)), luminance(toRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const toHsl = ({ r, g, b }: Rgb): Hsl => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
};

const fromHsl = ({ h, s, l }: Hsl): Rgb => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

const withL = (hsl: Hsl, l: number) => toHex(fromHsl({ ...hsl, l: clamp(l) }));

/**
 * Empuja la luminosidad hasta que el color se LEE sobre `on`, y devuelve el primero que pasa.
 *
 * Camina en pasos de 2% en la direccion que aleja del fondo —hacia negro sobre papel claro, hacia
 * blanco sobre papel oscuro— en vez de saltar al extremo: asi el resultado sigue siendo reconocible
 * como el color que la persona eligio y no un gris casi negro. Cincuenta pasos cubren el recorrido
 * entero de la rampa, asi que el `for` siempre termina; si un color no llega nunca (un amarillo puro
 * sobre blanco no puede), sale el ultimo paso, que es lo mas oscuro que se pudo.
 */
const untilReadable = (hsl: Hsl, on: string, target: number): string => {
  const darken = luminance(toRgb(on)) > 0.5;
  let last = withL(hsl, hsl.l);
  for (let i = 0; i <= 50; i++) {
    const candidate = withL(hsl, darken ? hsl.l - i * 0.02 : hsl.l + i * 0.02);
    last = candidate;
    if (contrast(candidate, on) >= target) return candidate;
  }
  return last;
};

/** Lo que pide AA para texto normal, y lo que cumplen los cinco acentos escritos a mano. */
const READABLE = 4.5;

/** Una forma decorativa no es texto: le basta con separarse del papel. Es el minimo AA de graficos. */
const VISIBLE = 3;

/** Cuanto se aclara o se oscurece el tinte de `soft` respecto al papel. */
const SOFT_L = { light: 0.88, dark: 0.14 };

/** El tinte suave se desatura: a plena saturacion un chip rosa compite con el texto que lleva dentro. */
const SOFT_S = 0.34;

/**
 * Los tres pasos de un acento, derivados de un solo color base.
 *
 * - `solid` es el color tal cual en claro. En oscuro se aclara hasta separarse del papel: un azul
 *   marino sobre el negro de la app —o sobre el de la Isla Dinamica— seria una forma invisible.
 * - `soft` es el mismo tono llevado al extremo del papel y desaturado. Es fondo de chip, nunca texto.
 * - `ink` es el unico paso que se lee, y por eso es el unico que se mide: se empuja hasta 4.5:1.
 *
 * El `surface` llega por parametro y no se importa de `theme.ts` para no invertir la dependencia: este
 * modulo no debe saber que existe un tema.
 */
export const deriveRamp = (base: string, surface: string): Ramp => {
  const hsl = toHsl(toRgb(base));
  const dark = luminance(toRgb(surface)) <= 0.5;

  return {
    solid: dark ? untilReadable(hsl, surface, VISIBLE) : normalizeHex(base),
    soft: withL({ ...hsl, s: Math.min(hsl.s, SOFT_S) }, dark ? SOFT_L.dark : SOFT_L.light),
    ink: untilReadable(hsl, surface, READABLE),
  };
};
