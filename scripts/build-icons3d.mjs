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
/** Aire minimo alrededor del objeto, como fraccion del lado: ningun icono llega al borde. */
const PAD = 0.08;
/**
 * Cuanta tinta cubre un icono, como fraccion del cuadro. Es la medida que empareja el peso entre
 * una figura maciza y una de trazos.
 *
 * Medido sobre los seis de la prueba antes de normalizar: casa 0.618, calendario 0.538, reloj
 * 0.518, trofeo 0.398, birrete 0.310, usuario 0.249. Dos y medio a uno entre el mas pesado y el
 * mas liviano, con todos ocupando la misma caja.
 *
 * El objetivo va por debajo de la mediana a proposito: los densos encogen y los ligeros se quedan
 * como estan, topados por la caja. Subirlo no agranda a los ligeros — solo los deja igual y encoge
 * a todos los demas.
 */
const INK = 0.34;
/** Debajo de esto un pixel es borde suavizado y no define el rango tonal del objeto. */
const SOLID = 200;
/**
 * Que fraccion del objeto se recorta en CADA extremo antes de estirar el modelado sobre la rampa.
 *
 * Es la perilla que decide si un icono se lee con volumen o como silueta. Con los extremos en el
 * minimo y el maximo absolutos, un filo especular de dos pixeles se lleva el paso claro de la rampa
 * entero y el CUERPO del objeto queda comprimido en la parte baja. Se veia en el rayo y en la hoja
 * —casi una sola faceta mas un filo de luz, que salian planos— mientras el reloj y la paleta, que
 * reparten su luz sobre area grande, si modelaban. O sea que el defecto no estaba en el tinte:
 * estaba en dejar que dos outliers fijaran la escala de todo el icono.
 *
 * Recortar no pierde nada. El clamp del mapa aplasta lo que queda fuera contra los topes, que es
 * justo lo que se quiere: un reflejo especular DEBE saturar. Lo que gana es el 96% central, que se
 * estira sobre la rampa completa.
 */
const CLIP = 0.02;
/**
 * Donde se ancla la MEDIANA de cada icono dentro de su rampa, de 0 (el paso bajo) a 1 (el alto).
 *
 * Es el hermano tonal de `INK`. `INK` empareja cuanta tinta cubre cada icono para que ninguno pese
 * mas que otro; esto empareja a que ALTURA de su rampa se asienta, para que ninguno se vea mas
 * oscuro que otro. Sin el, `CLIP` arreglaba cada icono por separado y rompia el conjunto: el
 * recorte depende de como reparte su luz cada render, asi que la casa y el sol —una faceta grande
 * y clara, la sombra en un filo— saltaban a mediana 198 y 132 mientras el reloj y el birrete caian
 * a 44 y 38. Medido sobre los 18: el rango de medianas pasaba de 104 puntos a 168.
 *
 * Se ancla la mediana DENTRO de la rampa y no la luminancia absoluta, que es lo que deja vivas las
 * familias de color: la rampa clay entera es mas clara que la forest, y esa diferencia es el dato
 * (ver `FAMILY` en focus-accent.ts). Anclar luminancia la borraria.
 *
 * 0.38 y no 0.5: el papel de la app es blanco, asi que el objeto tiene que asentarse por DEBAJO del
 * medio para que la silueta contraste, y el rango que queda por arriba es el que dibuja el
 * modelado. Se aplica como gamma, o sea que los dos extremos no se mueven — el reflejo sigue
 * saturando y la sombra sigue tocando fondo.
 */
const TONE = 0.38;
/**
 * Piso del rango tonal de origen, en niveles. Es el tope de cuanto se le permite AMPLIFICAR a la
 * tubería, y existe porque el set no es homogeneo ni de lejos.
 *
 * Medido sobre los 18, la ventana util (p2-p98 sobre los pixeles del estarcido) se parte en dos
 * grupos: reloj, birrete, calendario y compañia traen 170-200 niveles de sombreado, y casa, rayo,
 * luna, hoja, sol y palomita traen entre 21 y 40. Los segundos no vienen mal exportados — vienen
 * casi PLANOS del render, que es de donde salia la queja de que se ven como siluetas.
 *
 * Estirar 21 niveles sobre la rampa entera no inventa modelado: multiplica por doce lo poco que hay
 * y con ello los escalones de la cuantizacion, que es lo que saco anillos concentricos en la cara
 * de la casa — curvas de nivel de una superficie casi lisa. Con el piso, un icono plano ocupa la
 * fraccion de rampa que su sombreado real merece (la casa, 30%) y uno modelado sigue ocupandola
 * entera.
 */
const MIN_SPAN = 70;
/**
 * Cuanto puede curvar el anclaje de `TONE`. Sin tope, un icono cuya masa se apila contra un extremo
 * pedia gamma 19.8 para mover su mediana al ancla — una potencia asi no reasienta el objeto, lo
 * aplasta contra un tono y convierte todo su modelado en un escalon.
 *
 * Con el tope, esos iconos quedan un poco fuera del ancla. Es lo correcto: la alternativa no era
 * tenerlos en tono y bien, era tenerlos en tono y rotos.
 */
const GAMMA = { min: 0.4, max: 3 };
/**
 * Tramado ordenado de 4x4, en [-0.5, 0.5) de un nivel de la FUENTE.
 *
 * El render de Figma llega en 8 bits, y con la ventana en su piso (`MIN_SPAN`) cada nivel de origen
 * se abre en ~3.7 de salida. Sin romper ese escalon, una superficie lisa sale en franjas. Es un
 * artefacto de cuantizacion, no del render: se comprobo estirando el contraste del export original,
 * que esta limpio.
 *
 * Ordenado y no aleatorio para que el build sea reproducible: los .webp se commitean, y con ruido
 * cada corrida daria un archivo distinto y un diff que no significa nada.
 *
 * Se suma en el dominio de la LUMINANCIA y no al color de salida. Es la unica posicion que sirve:
 * el escalon nace al cuantizar la entrada, asi que media unidad de origen es lo que hay que romper
 * — medio nivel de SALIDA no llegaria ni a un cuarto de banda.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

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

  // 1. Quitarle al compuesto el sangrado de la sombra.
  //
  //    Figma no exporta el marco a secas: lo agranda para que quepa la sombra, y ese margen es
  //    ASIMETRICO. La sombra del set es `radio 100, desplazamiento (±60, 60)`, asi que el marco
  //    crece 200 de ancho y 200 de alto SIEMPRE, repartidos segun la variante:
  //      R (-60, 60)  ->  160 a la izquierda,  40 arriba
  //      L ( 60, 60)  ->   40 a la izquierda,  40 arriba
  //      centro (0,60)-> 100 a la izquierda,  40 arriba
  //    Arriba siempre 40, asi que lo unico en duda es el margen izquierdo, y son tres valores. Se
  //    prueban los tres y gana el que deje la silueta del bitmap de origen encima de pixeles de
  //    icono en vez de encima de sombra. Medir le gana a confiar en el nombre de la capa.
  const src = join(dir, 'export.png');
  const sheet = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frameW = sheet.info.width - BLEED;
  const frameH = sheet.info.height - BLEED;

  const mask = await sharp(await pickStencil(dir))
    .resize(frameW, frameW, { fit: 'fill' })
    .extractChannel('alpha').raw().toBuffer();

  let left = BLEED_LEFT[0];
  let bestScore = -1;
  for (const candidate of BLEED_LEFT) {
    let hits = 0;
    for (let y = 0; y < frameW; y++) {
      for (let x = 0; x < frameW; x++) {
        if (mask[y * frameW + x] < SOLID) continue;
        const i = ((y + BLEED_TOP) * sheet.info.width + x + candidate) * 4;
        const d = sheet.data;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (lum < BG_LUM && d[i + 2] - d[i] < SHADOW_BLUE) hits++;
      }
    }
    if (hits > bestScore) { bestScore = hits; left = candidate; }
  }

  const { data, info } = await sharp(src)
    .extract({ left, top: BLEED_TOP, width: frameW, height: frameH })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // 2. El alfa sale del bitmap de origen. Cubre el cuadro del icono; lo que sobra abajo es el
  //    "Element" que se desborda del marco, y ahi no hay silueta que conservar.
  const stencil = new Uint8Array(width * height);
  stencil.set(mask.subarray(0, Math.min(mask.length, stencil.length)));

  const n = width * height;
  const lum = new Float32Array(n);

  // Un histograma de 256 cubetas sobre los pixeles solidos. Es todo lo que hace falta para sacar un
  // percentil, y evita ordenar las decenas de miles de luminancias de cada icono.
  const hist = new Uint32Array(256);
  let solid = 0;

  for (let i = 0, p = 0; p < n; i += 4, p++) {
    if (!stencil[p]) continue;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (stencil[p] < SOLID) continue;
    hist[Math.round(lum[p])]++;
    solid++;
  }

  /** La luminancia por debajo de la cual queda `fraction` del objeto. */
  const percentile = (fraction) => {
    const target = fraction * solid;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= target) return v;
    }
    return 255;
  };

  // 3. El mapa de degradado. El rojo de origen no ocupa 0-255: sin estirar su rango real se tira
  //    la mayor parte del modelado antes de empezar. Los extremos son percentiles y no el minimo y
  //    el maximo — ver `CLIP`, que es lo que separa un objeto con volumen de una silueta.
  const min = percentile(CLIP);
  const max = percentile(1 - CLIP);
  // El piso solo puede ENSANCHAR la ventana, o sea reducir la amplificacion. Ver `MIN_SPAN`.
  const span = Math.max(max - min, MIN_SPAN);

  // La gamma que lleva la mediana de ESTE icono al ancla comun del set. Ver `TONE`. Es monotona y
  // fija los dos extremos, asi que reasienta el objeto sin tocar ni el reflejo ni la sombra.
  const mid = Math.min(1, Math.max(0, (percentile(0.5) - min) / span));
  const gamma =
    mid > 0 && mid < 1
      ? Math.min(GAMMA.max, Math.max(GAMMA.min, Math.log(TONE) / Math.log(mid)))
      : 1;

  for (let i = 0, p = 0; p < n; i += 4, p++) {
    data[i + 3] = stencil[p];
    if (!stencil[p]) continue;
    const dither = BAYER[((p / width) & 3) * 4 + (p % width & 3)];
    const g = Math.min(1, Math.max(0, (lum[p] + dither - min) / span)) ** gamma;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(lo[c] + g * (hi[c] - lo[c]));
  }

  // 4. Encajar todos con el MISMO PESO OPTICO.
  //
  //    No basta con recortar y meter cada uno en la misma caja: un reloj es un circulo lleno y un
  //    birrete son cuatro trazos, asi que a igual caja el reloj pesa el doble. Es exactamente la
  //    queja que hizo dejar SF Symbols por Lucide — ahi la perilla era `strokeWidth`, y un PNG no
  //    tiene ninguna. La perilla equivalente es el AREA: se escala cada icono para que cubra la
  //    misma tinta, con la caja como tope para que ninguno se salga.
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const box = Math.round(SIZE * (1 - 2 * PAD));
  const trimmed = await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });

  let ink = 0;
  for (const a of await sharp(trimmed.data).extractChannel('alpha').raw().toBuffer()) ink += a;
  ink /= 255;

  const fit = box / Math.max(trimmed.info.width, trimmed.info.height);
  const even = Math.sqrt((INK * SIZE * SIZE) / ink);
  const scale = Math.min(fit, even);
  const w = Math.round(trimmed.info.width * scale);
  const h = Math.round(trimmed.info.height * scale);

  // Se PADEA, no se reencaja: un `resize` con `fit: 'contain'` volveria a estirar hasta llenar el
  // cuadro y borraria la normalizacion que se acaba de calcular.
  return sharp(trimmed.data)
    .resize(w, h)
    .extend({
      left: (SIZE - w) >> 1,
      right: SIZE - w - ((SIZE - w) >> 1),
      top: (SIZE - h) >> 1,
      bottom: SIZE - h - ((SIZE - h) >> 1),
      background: clear,
    })
    // 95 y no 82. WebP con perdida contornea los degradados suaves, y al repartir el modelado sobre
    // la rampa entera (`CLIP` + `TONE`) los degradados se volvieron anchos: la cara de la casa salia
    // en anillos concentricos que NO estan en el render de Figma — se comprobo estirando el
    // contraste del export original. A 82 el encoder los inventa; a 95 no.
    //
    // Cuesta 30 KB en los 18 iconos juntos. Es el precio mas barato del proyecto: son los assets
    // que cargan la identidad visual de la app y se ven en cada fila de cada lista.
    .webp({ quality: 95, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

/**
 * Como se reconoce un pixel de icono. Medido sobre los exports, no adivinado:
 *
 *   fondo del marco   255,255,255                 neutro,  luminancia 255
 *   sombra de Figma   240,242,245 -> 252,252,254  azulada, B-R entre 2 y 5
 *   detalle blanco    241,241,241                 neutro,  luminancia ~242
 *   cuerpo rojo       241,43,66                   B-R -175
 *
 * O sea: es icono lo que no llega a blanco puro y no viene teñido de azul. Un umbral de luminancia
 * a secas no alcanza — el blanco del icono y el del fondo se pisan — y por eso el tinte azul de la
 * sombra (`#102D61`) es el que decide.
 */
const BG_LUM = 253;
const SHADOW_BLUE = 2;

/** Cuanto agranda Figma el marco para que quepa la sombra: radio 100 mas y menos el desplazamiento 60. */
const BLEED = 200;
const BLEED_TOP = 40;
const BLEED_LEFT = [160, 40, 100];

/**
 * Los dos pasos de la rampa entre los que se estira el modelado, por acento.
 *
 * La ventana se probo con los seis iconos de la prueba a 24, 28, 32, 44 y 88pt, sobre papel y sobre
 * tarjeta, y dentro de una maqueta de la capsula. Gana 200-700 porque es la que mas contraste
 * interno deja en los tamaños CHICOS — a 32pt las rayas del calendario y la manecilla del reloj son
 * lo unico que separa un icono de una mancha. 200-800 y 300-800 se ven mejor a 88 y peor a 32, y el
 * tamaño que decide es el de la barra.
 *
 * `leaf` sube la ventana en la misma rampa que `forest` por la misma razon que en `theme.ts`:
 * comparten familia y sin separarlos se leen como un solo color.
 *
 * Pero sube UN paso, no dos. Con 400-900 el tope era `blackForest[900]` (#d5e4c3), un verde casi
 * blanco que con el mapa viejo casi ningun pixel alcanzaba — en cuanto `CLIP` y `TONE` repartieron
 * el modelado sobre la ventana entera, la paleta de Creatividad se fue a sage lavado y dejo de
 * contrastar contra el papel blanco. 300-800 topa en #aac987: sigue siendo visiblemente mas claro
 * que forest, que es todo lo que se le pedia.
 */
export const TINT = {
  forest: ['blackForest', '200', '700'],
  olive: ['oliveLeaf', '200', '700'],
  leaf: ['blackForest', '300', '800'],
  clay: ['sunlitClay', '200', '700'],
  copper: ['copperwood', '200', '700'],
};

/**
 * Que acento usa cada icono.
 *
 * Uno solo para todo el cromo: dieciocho iconos cada uno de su color es ruido, no sistema. Las
 * siete areas de enfoque son la excepcion, porque ahi el color ES el dato — y el reparto no se
 * inventa aqui, es el mismo `FAMILY` de `src/features/tasks/focus-accent.ts`: verdes para
 * produccion, calidos para vida, cobre para dinero. Que casa, salud y relaciones compartan tono es
 * la intencion, no un descuido: el icono distingue dentro de la familia.
 */
export const CHROME = 'forest';
export const AREA_ACCENT = {
  work: 'forest',
  study: 'olive',
  creativity: 'leaf',
  home: 'clay',
  health: 'clay',
  relationships: 'clay',
  money: 'copper',
};

/**
 * Los iconos que se hornean DOS veces.
 *
 * La casa es la unica con dos trabajos, y son incompatibles: como area de enfoque "hogar" el color
 * ES el dato y tiene que ser calido —la misma familia que salud y relaciones, la que dice "vida" de
 * un vistazo en la agenda— y como pestaña de Hoy tiene que ser cromo, porque al lado van el reloj,
 * el calendario y el usuario.
 *
 * El mapa de arriba esta indexado por AREA, pero el nombre del area y el del asset coinciden, asi
 * que la barra se llevaba el clay sin que nadie lo decidiera: la unica casa marron entre tres verdes
 * — que es justo lo que `CHROME` existe para impedir. Un archivo no puede ser dos colores, asi que
 * son dos archivos.
 */
export const EXTRA = [{ dir: 'home', name: 'home-chrome', accent: CHROME }];

if (import.meta.url === `file://${process.argv[1]}`) {
  const palette = await loadPalette();
  await mkdir(OUT, { recursive: true });
  const slugs = [];
  for (const entry of await readdir(RAW)) {
    if ((await stat(join(RAW, entry))).isDirectory()) slugs.push(entry);
  }

  const jobs = [
    ...slugs.sort().map((slug) => ({ dir: slug, name: slug, accent: AREA_ACCENT[slug] ?? CHROME })),
    ...EXTRA,
  ];

  for (const job of jobs) {
    const [ramp, lo, hi] = TINT[job.accent];
    const webp = await bake(join(RAW, job.dir), palette[ramp][lo], palette[ramp][hi]);
    await writeFile(join(OUT, `${job.name}.webp`), webp);
    console.log(`${job.name.padEnd(16)} ${(webp.length / 1024).toFixed(1)} KB`);
  }
}
