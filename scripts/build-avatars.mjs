// Recorta los memoji 3D del onboarding a partir de la lamina de Figma.
//
// El set (Free 3D Memoji Avatars Pack, Figma Community) es una GRILLA: un solo frame con las ~45
// cabezas puestas en filas. El archivo es de Community y la copia vive en un plan con seat View, asi
// que el MCP de Figma no lo abre y no hay exportacion por nodo. La entrada es entonces UNA lamina
// exportada a mano y el troceado se hace aqui.
//
// A diferencia de `build-icons3d.mjs` esto NO tinta nada. Alli el color era cromo de marca y se
// horneaba; aqui el color ES el contenido — el tono de piel y el del pelo son lo que distingue a un
// avatar del de al lado — asi que la lamina se recorta y se reescala, y nada mas.
//
//   node scripts/build-avatars.mjs
//
// Entrada:  assets/avatars/_raw/grid.png    la lamina completa, a la resolucion que sea
// Salida:   assets/avatars/memoji-NN.webp   256px, cuadrado, fondo transparente
//           src/components/ui/avatar3d.tsx  el mapa de `require`, regenerado

import { readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets/avatars/_raw');
const OUT = join(ROOT, 'assets/avatars');
const COMPONENT = join(ROOT, 'src/components/ui/avatar3d.tsx');

/** Lado del asset final. Un avatar se pinta como mucho a 88pt, y 256 cubre @3x con holgura. */
const SIZE = 256;
/**
 * Aire alrededor de la cabeza, como fraccion del lado. Mas generoso que el 0.08 de los iconos
 * porque un avatar casi siempre va recortado en circulo: el circulo se come las esquinas del
 * cuadrado, y sin este margen se comeria tambien las orejas y el pelo.
 */
const PAD = 0.1;
/** Cuanto se puede alejar un pixel del color de fondo y seguir siendo fondo, por canal (0-255). */
const BG_TOLERANCE = 18;
/**
 * Donde termina el borde suave, en la misma escala. Un pixel del contorno que se aleja del fondo
 * menos que esto no es ni fondo ni dibujo sino la mezcla que dejo el antialias, y se le da alfa
 * parcial en vez de dejarlo opaco: si no, al recortar sobre fondo blanco queda un halo claro
 * alrededor de cada cabeza. Solo aplica a la rama de inundacion — el alfa que exporta Figma ya viene
 * bien resuelto.
 */
const EDGE_FULL = 54;

// ---------------------------------------------------------------------------------------------
// Mascara: que pixeles son dibujo y cuales son fondo
// ---------------------------------------------------------------------------------------------

/**
 * Marca el fondo de la lamina.
 *
 * Si el PNG trae alfa util, el fondo ya viene dado y basta con leerlo. Si viene opaco (Figma exporta
 * el frame con su relleno si lo tiene) hay que deducirlo, y se hace con un relleno por inundacion
 * DESDE EL BORDE en vez de con un simple "todo lo que se parezca al blanco". La diferencia importa:
 * un memoji tiene blanco dentro — los ojos, los dientes, el brillo de las gafas — y un umbral por
 * color se los comeria dejando agujeros en la cara. La inundacion solo alcanza lo que esta conectado
 * con el borde, asi que el blanco encerrado dentro de la cabeza sobrevive.
 *
 * En la rama de inundacion ESCRIBE el alfa de `data`: el fondo deducido se vuelve transparente de
 * verdad. Sin eso los recortes saldrian con el blanco de la lamina pegado y no se podrian poner
 * sobre el papel de la app.
 *
 * @returns {{ mask: Uint8Array, hadAlpha: boolean }} `mask[i] = 1` si el pixel es dibujo.
 */
function buildMask(data, width, height, channels) {
  const total = width * height;
  const mask = new Uint8Array(total);

  if (channels === 4) {
    let opaque = 0;
    for (let i = 0; i < total; i++) {
      if (data[i * 4 + 3] > 8) {
        mask[i] = 1;
        opaque++;
      }
    }
    // Si practicamente todo el lienzo es opaco, el alfa no separa nada y hay que inundar igual.
    if (opaque < total * 0.98) return { mask, hadAlpha: true };
    mask.fill(0);
  }

  // El color de fondo es el de las esquinas. Se toma la mediana de las cuatro para que una esquina
  // con dibujo encima no arrastre la decision.
  const corners = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + width - 1) * channels,
  ];
  const bg = [0, 1, 2].map((c) => {
    const values = corners.map((o) => data[o + c]).sort((a, b) => a - b);
    return (values[1] + values[2]) / 2;
  });

  /** Cuanto se aleja el pixel del fondo, por el canal que mas se aleje. */
  const bgDistance = (i) => {
    const o = i * channels;
    return Math.max(
      Math.abs(data[o] - bg[0]),
      Math.abs(data[o + 1] - bg[1]),
      Math.abs(data[o + 2] - bg[2]),
    );
  };
  const isBgColor = (i) => bgDistance(i) <= BG_TOLERANCE;

  // Inundacion iterativa con pila explicita: a 25 megapixeles la recursion revienta el stack.
  const background = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;

  const push = (i) => {
    if (!background[i] && isBgColor(i)) {
      background[i] = 1;
      stack[top++] = i;
    }
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  // Escribe el alfa. El interior se queda opaco y solo el contorno — lo que toca fondo — recibe el
  // valor intermedio, asi que el blanco de los ojos, que no toca fondo, no se ve afectado.
  for (let i = 0; i < total; i++) {
    const o = i * channels;
    if (background[i]) {
      mask[i] = 0;
      data[o + 3] = 0;
      continue;
    }
    mask[i] = 1;
    const x = i % width;
    const y = (i / width) | 0;
    const touchesBg =
      (x > 0 && background[i - 1]) ||
      (x < width - 1 && background[i + 1]) ||
      (y > 0 && background[i - width]) ||
      (y < height - 1 && background[i + width]);
    if (!touchesBg) continue;
    const ramp = (bgDistance(i) - BG_TOLERANCE) / (EDGE_FULL - BG_TOLERANCE);
    data[o + 3] = Math.max(0, Math.min(255, Math.round(ramp * 255)));
  }
  return { mask, hadAlpha: false };
}

// ---------------------------------------------------------------------------------------------
// Grilla: donde esta cada cabeza
// ---------------------------------------------------------------------------------------------

/**
 * Parte un perfil de ocupacion en tramos con contenido.
 *
 * No se codifica "7 columnas": la lamina puede venir recortada de otra forma o con la ultima fila a
 * medias — la de la referencia tiene tres avatares en vez de siete — asi que las bandas se leen del
 * pixel. `counts[i]` es cuantos pixeles de dibujo hay en la linea `i`.
 */
function findBands(counts, noiseFloor) {
  const bands = [];
  let start = -1;
  for (let i = 0; i < counts.length; i++) {
    const filled = counts[i] > noiseFloor;
    if (filled && start === -1) start = i;
    else if (!filled && start !== -1) {
      bands.push([start, i - 1]);
      start = -1;
    }
  }
  if (start !== -1) bands.push([start, counts.length - 1]);
  if (bands.length === 0) return bands;

  // Une lo que el antialias partio, y el umbral sale de los HUECOS, no de las bandas.
  //
  // Colgarlo del ancho de banda es lo intuitivo y esta mal. En esta lamina las cabezas casi llenan
  // su celda: bandas de ~600px con calles de ~110, o sea que cualquier fraccion del ancho que sirva
  // para tapar un corte de antialias se traga tambien la calle, y las siete filas salen fundidas en
  // una sola. Los huecos, en cambio, son bimodales por construccion — los de la rejilla son todos
  // parecidos entre si y los del antialias son de unos pocos pixeles — asi que el hueco mediano
  // mide la calle y una cuarta parte de esa medida separa las dos poblaciones sin tocar ninguna.
  const gaps = [];
  for (let i = 1; i < bands.length; i++) gaps.push(bands[i][0] - bands[i - 1][1] - 1);
  const medianGap = gaps.length ? [...gaps].sort((a, b) => a - b)[gaps.length >> 1] : 0;
  const glue = Math.max(2, medianGap * 0.25);

  const merged = [bands[0]];
  for (let i = 1; i < bands.length; i++) {
    const prev = merged[merged.length - 1];
    if (bands[i][0] - prev[1] - 1 < glue) prev[1] = bands[i][1];
    else merged.push(bands[i]);
  }

  // Y ahora si, las motas: lo que queda por debajo de un tercio de la banda mediana no es una cabeza.
  const widths = merged.map(([a, b]) => b - a + 1).sort((a, b) => a - b);
  const medianWidth = widths[widths.length >> 1];
  return merged.filter(([a, b]) => b - a + 1 > medianWidth * 0.35);
}

/**
 * Que fraccion de la pieza mas grande de la celda tiene que medir un trozo suelto para conservarlo.
 *
 * Existe porque la lamina trae basura: al menos un avatar — el de la coleta — lleva al lado una
 * esquirla naranja de unos pocos cientos de pixeles que viene asi del archivo de Figma. Molesta dos
 * veces. Se ve, que ya seria bastante en una rejilla donde el usuario esta eligiendo cara, y ademas
 * estira la caja hacia la derecha, asi que al centrar por caja la cara queda descentrada.
 *
 * 8% y no menos porque hay pelo que si esta separado de la cabeza y tiene que quedarse. Una esquirla
 * anda por el 1% de la cabeza y una coleta suelta no baja del 10%, asi que el corte cae en medio.
 */
const MIN_PART = 0.08;

/**
 * Aisla el avatar dentro de su celda y devuelve el rectangulo exacto que ocupa.
 *
 * Etiqueta las piezas conexas, se queda con la mayor y con lo que tenga tamaño de pieza de verdad, y
 * BORRA el resto de `mask` y del alfa de `data`. La caja se mide despues, sobre lo que sobrevive.
 */
function isolateSubject(mask, data, width, [x0, x1], [y0, y1]) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const labels = new Int32Array(w * h).fill(-1);
  const areas = [];
  const stack = new Int32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (labels[i] !== -1 || !mask[(y0 + ((i / w) | 0)) * width + x0 + (i % w)]) continue;
    const id = areas.length;
    let area = 0;
    let top = 0;
    labels[i] = id;
    stack[top++] = i;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const px = p % w;
      const py = (p / w) | 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (labels[n] !== -1 || !mask[(y0 + ny) * width + x0 + nx]) continue;
        labels[n] = id;
        stack[top++] = n;
      }
    }
    areas.push(area);
  }

  if (areas.length === 0) return { box: null, dropped: 0 };
  const floor = Math.max(...areas) * MIN_PART;

  let minX = x1;
  let maxX = x0;
  let minY = y1;
  let maxY = y0;
  let dropped = 0;
  for (let i = 0; i < w * h; i++) {
    const id = labels[i];
    if (id === -1) continue;
    const x = x0 + (i % w);
    const y = y0 + ((i / w) | 0);
    if (areas[id] < floor) {
      mask[y * width + x] = 0;
      data[(y * width + x) * 4 + 3] = 0;
      dropped++;
      continue;
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    box: maxX < minX ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    dropped,
  };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  let files;
  try {
    files = (await readdir(RAW)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.error(`No hay lamina en ${RAW}\nExporta el frame de la grilla como PNG y dejalo ahi.`);
    process.exit(1);
  }
  const source = join(RAW, files[0]);
  console.log(`Lamina: ${files[0]}`);

  const image = sharp(source, { limitInputPixels: false });
  const { width, height } = await image.metadata();
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { mask, hadAlpha } = buildMask(data, width, height, info.channels);
  console.log(`  ${width}x${height}, fondo por ${hadAlpha ? 'alfa' : 'inundacion desde el borde'}`);

  // Filas primero, y las columnas DENTRO de cada fila. Buscar las columnas sobre la lamina entera
  // daria una rejilla rigida y colocaria celdas vacias donde la ultima fila se queda corta.
  const rowCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let n = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) n += mask[row + x];
    rowCounts[y] = n;
  }
  const rows = findBands(rowCounts, Math.max(2, Math.round(width * 0.002)));

  const boxes = [];
  let strays = 0;
  for (const [y0, y1] of rows) {
    const colCounts = new Int32Array(width);
    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) colCounts[x] += mask[row + x];
    }
    const cols = findBands(colCounts, Math.max(2, Math.round((y1 - y0 + 1) * 0.002)));
    for (const col of cols) {
      const { box, dropped } = isolateSubject(mask, data, width, col, [y0, y1]);
      if (box) boxes.push(box);
      if (dropped > 0) strays += dropped;
    }
  }

  if (boxes.length === 0) {
    console.error('No se detecto ningun avatar. Revisa que la lamina no lleve la UI de Figma encima.');
    process.exit(1);
  }
  console.log(`  ${rows.length} filas, ${boxes.length} avatares`);
  if (strays > 0) console.log(`  ${strays} px de esquirlas sueltas descartados`);

  // Un unico lado para todos, tomado del avatar mas grande. Cuadrar cada uno a SU propia caja seria
  // lo obvio y es lo que hacen los iconos, pero aqui rompe: al que lleva melena o turbante la caja
  // le crece, normalizarla lo encoge, y en una fila de avatares se ve una cara mas pequeña que las
  // demas. El diseñador ya los dibujo a la misma escala — esto la respeta.
  const side = Math.round(Math.max(...boxes.map((b) => Math.max(b.width, b.height))) * (1 + PAD * 2));

  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) {
    if (f.endsWith('.webp')) await rm(join(OUT, f));
  }

  const slugs = [];
  for (const [i, box] of boxes.entries()) {
    const slug = `memoji-${String(i + 1).padStart(2, '0')}`;
    const left = (side - box.width) >> 1;
    const top = (side - box.height) >> 1;

    // El lienzo cuadrado se arma aqui, a mano, y no con `.extend()`.
    //
    // Dos razones. La primera es coste: copiar del buffer ya decodificado evita volver a abrir el
    // PNG por avatar, que eran 45 descompresiones de 25 megapixeles.
    //
    // La segunda es correccion, y es la que obliga. El encadenado de sharp NO se ejecuta en el orden
    // en que se escribe: su pipeline tiene un orden fijo y `resize` va SIEMPRE antes que `extend`,
    // asi que `.extend(...).resize(256)` escala primero y añade despues el margen calculado para el
    // tamaño original — el archivo sale a 256 mas el margen, ni cuadrado ni de 256. Armando el
    // lienzo antes, a sharp solo le queda escalar y no hay orden que respetar.
    const canvas = Buffer.alloc(side * side * 4); // ceros = transparente
    for (let row = 0; row < box.height; row++) {
      const from = ((box.top + row) * width + box.left) * 4;
      const to = ((top + row) * side + left) * 4;
      data.copy(canvas, to, from, from + box.width * 4);
    }

    await sharp(canvas, { raw: { width: side, height: side, channels: 4 } })
      .resize(SIZE, SIZE, { fit: 'fill', kernel: 'lanczos3' })
      // `effort` a 5 y no a 6, que es lo que suele ponerse por reflejo. Medido sobre un recorte real
      // de la lamina: 6 da 8096 bytes en 1198 ms y 5 da 8230 en 8.5 ms. Son 134 bytes — un 1.7% —
      // a cambio de 140 veces el tiempo, y multiplicado por 45 avatares eso es la diferencia entre
      // dos minutos de build y dos segundos.
      .webp({ quality: 92, effort: 5 })
      .toFile(join(OUT, `${slug}.webp`));

    slugs.push(slug);
  }

  await writeFile(COMPONENT, renderComponent(slugs));
  console.log(`\n${slugs.length} avatares en assets/avatars/ + src/components/ui/avatar3d.tsx`);
}

/**
 * Regenera el componente. Se escribe desde aqui y no a mano porque el mapa tiene que seguir a los
 * archivos: Metro resuelve `require` en tiempo de compilacion, asi que cada avatar se nombra una vez
 * y un `require` con plantilla no compila. Mismo trato que `icon3d.tsx`.
 */
function renderComponent(slugs) {
  return `import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

/**
 * Los avatares 3D del onboarding.
 *
 * GENERADO por \`scripts/build-avatars.mjs\` — no editar a mano. Salen de la lamina de Figma
 * (Free 3D Memoji Avatars Pack, Community) troceada por ese script.
 *
 * Van sin tintar, al reves que los de \`icon3d.tsx\`. Alli el color era cromo de marca y se horneaba
 * al verde; aqui el color ES el contenido, porque el tono de piel y el del pelo son justo lo que hace
 * que uno se elija sobre otro. Por eso tampoco llevan \`tintColor\` ni variante clara/oscura.
 *
 * Los nombres son posicionales, en el orden en que estan en la lamina. No hay nada que nombrar: son
 * caras, no conceptos, y numerarlas evita inventarles una identidad que el set no les da.
 */

const AVATARS = {
${slugs.map((s) => `  '${s}': require('@/assets/avatars/${s}.webp'),`).join('\n')}
} as const;

export type Avatar3DName = keyof typeof AVATARS;

/** Todos, en el orden de la lamina. Es lo que pinta la cuadricula del onboarding. */
export const AVATAR_NAMES = Object.keys(AVATARS) as Avatar3DName[];

/**
 * Los tamaños del sistema. \`sm\` es el de una fila o un comentario, \`md\` el de la cabecera de
 * perfil, \`lg\` el de la celda del selector y \`hero\` el de la confirmacion en el onboarding.
 */
export const Avatar3DSize = { sm: 32, md: 44, lg: 72, hero: 128 } as const;

export function Avatar3D({
  name,
  size = Avatar3DSize.lg,
  style,
}: {
  name: Avatar3DName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={AVATARS[name]}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      // Quien lo pinta sabe de quien es la cara; el archivo no. La etiqueta la pone el sitio de uso.
      accessible={false}
    />
  );
}
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
