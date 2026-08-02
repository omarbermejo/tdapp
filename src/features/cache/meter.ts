import { AppState } from 'react-native';

/**
 * El contador de peticiones. SOLO EN DESARROLLO.
 *
 * Existe para poder decir "antes 26 peticiones por ciclo, ahora N" con un numero medido y no con una
 * impresion. Y sobre todo para que el ANTES y el DESPUES salgan del mismo instrumento: comparar un
 * conteo hecho a ojo contra otro hecho con un contador no compara nada.
 *
 * Se engancha en `request<T>()` y con eso ve el 100% del trafico — `fetch(` aparece UNA sola vez en
 * toda la app, asi que no hay ningun camino que se lo salte ni ningun sitio nuevo que alguien pueda
 * olvidarse de instrumentar.
 *
 * Es desechable: cuando el cache este medido y asentado, este archivo se puede borrar entero sin
 * tocar nada mas.
 */

/** Como acabo una peticion. `net` es la unica que cuesta red. */
export type Outcome = 'net' | 'hit' | 'dedup';

type Row = { net: number; hit: number; dedup: number; ms: number };

const rows = new Map<string, Row>();
let since = Date.now();

/**
 * La ruta sin sus valores: `/tasks?date=2026-08-01&workspaceId=3` cuenta como `/tasks?date`.
 *
 * Sin esto cada dia y cada espacio serian una fila distinta y la tabla no diria nada. Lo que interesa
 * es "cuantas veces se pidio la lista de un dia", no cual.
 */
function templateOf(path: string): string {
  /*
    Los aciertos de cache llegan con la LLAVE (`2|workspaces|...`) y no con la ruta, porque quien los
    apunta es el store y alli no hay URL. Se normaliza a algo con la misma pinta que una ruta o la
    tabla mezclaria dos idiomas y dejaria de poder leerse de un vistazo. El primer trozo es el id de
    la cuenta y sobra.
  */
  if (path.includes('|')) return `~/${path.split('|').slice(1).join('/')}`;

  const [route, query] = path.split('?');
  // Los ids numericos se colapsan: /tasks/42 y /tasks/43 son la misma pregunta.
  const clean = route.replace(/\/\d+/g, '/:id');
  if (!query) return clean;
  const keys = query
    .split('&')
    .map((pair) => pair.split('=')[0])
    .sort()
    .join(',');
  return `${clean}?${keys}`;
}

/** Apunta una peticion. `ms` solo tiene sentido en las de red. */
export function track(path: string, outcome: Outcome, ms = 0) {
  if (!__DEV__) return;
  const key = templateOf(path);
  const row = rows.get(key) ?? { net: 0, hit: 0, dedup: 0, ms: 0 };
  row[outcome]++;
  row.ms += ms;
  rows.set(key, row);
}

/**
 * Vuelca la tabla y reinicia la cuenta.
 *
 * Ordenada por peticiones de red descendente: lo primero que se lee tiene que ser lo que mas cuesta.
 */
export function dump(label = 'ciclo') {
  if (!__DEV__ || !rows.size) return;

  const sorted = [...rows.entries()].sort((a, b) => b[1].net - a[1].net);

  const net = sorted.reduce((sum, [, r]) => sum + r.net, 0);
  const saved = sorted.reduce((sum, [, r]) => sum + r.hit + r.dedup, 0);
  const secs = Math.round((Date.now() - since) / 1000);

  /*
    Texto plano y no `console.table`: el puente de React Native no serializa la tabla, asi que en la
    consola de Metro sale la cabecera y nada mas. Alineado a mano, que se lee igual de bien.
  */
  const lines = sorted.map(([ruta, r]) => {
    const avg = r.net ? Math.round(r.ms / r.net) : 0;
    return `  ${ruta.padEnd(34)} red:${String(r.net).padStart(3)}  cache:${String(r.hit).padStart(3)}  dedup:${String(r.dedup).padStart(3)}  ${avg}ms`;
  });

  console.log(
    `\n[meter] ${label} · ${secs}s · ${net} de red, ${saved} evitadas\n${lines.join('\n')}\n`
  );

  rows.clear();
  since = Date.now();
}

/**
 * Vuelca al pasar a segundo plano: cada vez que sales de la app te dice lo que costo la sesion.
 *
 * Se registra una sola vez, al importar el modulo, y no en un efecto de React — no pertenece a
 * ninguna pantalla y no debe morir cuando una se desmonte.
 */
if (__DEV__) {
  AppState.addEventListener('change', (state) => {
    if (state === 'background') dump('sesion');
  });
}
