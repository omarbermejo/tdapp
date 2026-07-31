// Hornea los iconos 3D de Figma al color de la app.
//
// Los iconos del set (BRIX Agency, Figma Community) son renders rasterizados tintados EN FIGMA con
// dos variables: `Primary palette/Red #FF2D46` y `White Overlay #FFFFFF`, mas una sombra
// `#102D6114, blur 100`. No hay SVG y el archivo es de Community, asi que el tinte se hace aqui.
//
// La operacion es un MAPA DE DEGRADADO por luminancia: el pixel mas oscuro del render va al paso
// bajo de una rampa de la marca y el mas claro al paso alto. Es lo unico que permite elegir el
// contraste aparte del tono — que es justo lo que una rotacion de tono no puede hacer, y por lo que
// `modulate({hue})` no sirve: #FF2D46 es H353 S100 L59 y el verde de la marca es H88 S39 L15, asi
// que rotar el tono aterriza en verde neon y compensar con `brightness` aplasta el rango tonal
// (x0.26 mapea 50 puntos de luminancia sobre 13) y con el se va el modelado 3D, que es todo el
// punto del set.
//
//   npm i -D sharp
//   node scripts/build-icons3d.mjs
//
// Entrada:  assets/icons3d/_raw/<slug>/export.png   el compuesto de Figma, en rojo
//           assets/icons3d/_raw/<slug>/r1.png ...   los bitmaps de origen que devuelve el MCP
// Salida:   assets/icons3d/<slug>.webp              256px, tintado

import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets/icons3d/_raw');
const OUT = join(ROOT, 'assets/icons3d');

/** Lado del asset final. El tope de render de un icono 3D es 96pt, y 256 cubre @3x con holgura. */
const SIZE = 256;
/** Aire alrededor del objeto, como fraccion del lado. Fijo para todos: es lo que empareja el peso. */
const PAD = 0.08;
/** Debajo de esto un pixel es borde suavizado y no define el rango tonal del objeto. */
const SOLID = 200;

/**
 * Los extremos del mapa salen de las rampas de `theme.ts`, nunca de un hex escrito aqui.
 *
 * No es solo por la regla del proyecto: tambien resuelve el modo oscuro solo. Un icono asentado en
 * el medio tono lleva valores oscuros Y claros dentro de si mismo, asi que se lee sobre el papel de
 * la app y sobre el negro de la Live Activity con UN solo archivo, sin variante por esquema.
 *
 * Se lee con expresion regular en vez de importar el modulo porque `theme.ts` arrastra
 * `expo-router`, `react` y `react-native`, que en Node no resuelven.
 */
async function loadPalette() {
  const src = await readFile(join(ROOT, 'src/constants/theme.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const Palette'), src.indexOf('} as const;'));
  const palette = {};
  let ramp = null;
  for (const line of block.split('\n')) {
    const open = line.match(/^\s{2}(\w+):\s*\{/);
    if (open) { ramp = open[1]; palette[ramp] = {}; continue; }
    const step = line.match(/^\s{4}(\w+):\s*'(#[0-9a-fA-F]{6})'/);
    if (step && ramp) palette[ramp][step[1]] = step[2];
  }
  return palette;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * De los bitmaps de origen, el que trae la silueta COMPLETA del icono.
 *
 * El MCP devuelve todas las imagenes que el nodo usa como relleno, y vienen mezcladas: la figura
 * entera y la "Element" (el detalle que en Figma lleva el blanco), cada una duplicada a 1024 y 512.
 * La silueta completa es la de mayor caja de contenido — para el usuario, cabeza+cuerpo le gana al
 * cuerpo solo; para el calendario, el cuadro redondeado le gana a las rayitas.
 */
async function pickStencil(dir) {
  const files = (await readdir(dir)).filter((f) => /^r\d+\.png$/.test(f));
  let best = null;
  for (const f of files) {
    // Se compara la caja YA RECORTADA y normalizada por el lado del bitmap: los duplicados a 512 y
    // a 1024 son la misma figura, y sin normalizar ganaria siempre el de mas resolucion.
    const { info } = await sharp(join(dir, f)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const full = await sharp(join(dir, f)).metadata();
    const area = (info.width / full.width) * (info.height / full.height);
    if (!best || area > best.area + 1e-6) best = { file: join(dir, f), area, px: full.width };
    else if (Math.abs(area - best.area) < 1e-6 && full.width > best.px) best = { file: join(dir, f), area, px: full.width };
  }
  if (!best) throw new Error(`sin bitmaps de origen en ${dir}`);
  return best.file;
}

/**
 * Un icono, del rojo de Figma al color de la app.
 *
 * El alfa NO se deduce del compuesto: Figma lo exporta aplanado sobre blanco y ahi el blanco del
 * FONDO, el blanco del DETALLE del icono y la sombra de contacto del render caen los tres en el
 * mismo rango de gris claro — ningun umbral los separa, y el que lo intente se come el detalle
 * (fue lo que borro el cuerpo del icono de usuario) o deja la sombra convertida en mancha.
 *
 * Lo que si es exacto es el bitmap de origen: viene con su alfa, sin fondo y sin sombra. Se usa de
 * ESTARCIDO sobre el compuesto — de ahi sale la silueta — y del compuesto se toma el modelado y la
 * relacion de dos tonos. Los dos comparten origen y escala, asi que alinean sin aritmetica.
 */
export async function bake(dir, loHex, hiHex) {
  const lo = rgb(loHex);
  const hi = rgb(hiHex);

  const src = join(dir, 'export.png');
  const { width, height } = await sharp(src).metadata();
  const { data } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // El estarcido cubre el cuadro del icono (width x width). Lo que sobra abajo es el sangrado de la
  // sombra de Figma, que se va entero.
  const stencil = await sharp(await pickStencil(dir))
    .resize(width, width).extractChannel('alpha').raw().toBuffer();

  const n = width * height;
  const lum = new Float32Array(n);
  const alpha = new Uint8Array(n);
  let min = 255;
  let max = 0;

  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const a = p < width * width ? stencil[p] : 0;
    alpha[p] = a;
    if (!a) continue;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (a < SOLID) continue;
    if (lum[p] < min) min = lum[p];
    if (lum[p] > max) max = lum[p];
  }

  // El rango tonal real del render. El rojo de origen no ocupa 0-255: sin estirarlo se tira la
  // mayor parte del modelado antes de empezar.
  const span = max - min || 1;
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    data[i + 3] = alpha[p];
    if (!alpha[p]) continue;
    const g = Math.min(1, Math.max(0, (lum[p] - min) / span));
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(lo[c] + g * (hi[c] - lo[c]));
  }

  // Recortar el aire del marco de Figma y volver a padear IGUAL para todos.
  //
  // Sin el recorte, un glifo de 32pt muestra ~24pt de objeto y se ve mas chico que el icono de
  // linea que reemplaza; sin el padeo parejo vuelve el problema de peso optico desigual que hizo
  // dejar SF Symbols (ver el comentario de la barra en app/(app)/(tabs)/_layout.tsx).
  const inner = Math.round(SIZE * (1 - 2 * PAD));
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };

  return sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(inner, inner, { fit: 'inside', background: clear })
    .resize(SIZE, SIZE, { fit: 'contain', background: clear })
    .webp({ quality: 82, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

/**
 * Que rampa usa cada icono.
 *
 * Una sola para todo el cromo: sesenta iconos cada uno de su color es ruido, no sistema. Las siete
 * areas de enfoque son la excepcion, porque ahi el color ES el dato. Los nombres siguen a
 * `src/features/tasks/focus-accent.ts`.
 */
export const CHROME = 'blackForest';
export const AREA_RAMP = {
  study: 'oliveLeaf',
  work: 'blackForest',
  home: 'blackForest',
  health: 'oliveLeaf',
  money: 'copperwood',
  relationships: 'sunlitClay',
  creativity: 'sunlitClay',
};

/** Los dos pasos de la rampa entre los que se estira el modelado. */
export const WINDOW = ['300', '800'];

if (import.meta.url === `file://${process.argv[1]}`) {
  const palette = await loadPalette();
  await mkdir(OUT, { recursive: true });
  const slugs = [];
  for (const entry of await readdir(RAW)) {
    if ((await stat(join(RAW, entry))).isDirectory()) slugs.push(entry);
  }

  for (const slug of slugs.sort()) {
    const ramp = palette[AREA_RAMP[slug] ?? CHROME];
    const webp = await bake(join(RAW, slug), ramp[WINDOW[0]], ramp[WINDOW[1]]);
    await writeFile(join(OUT, `${slug}.webp`), webp);
    console.log(`${slug.padEnd(16)} ${(webp.length / 1024).toFixed(1)} KB`);
  }
}
