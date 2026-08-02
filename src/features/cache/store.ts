import { File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';

import { track } from './meter';

/**
 * El cache de respuestas de la app: una copia en memoria, respaldada en disco.
 *
 * Existe porque hoy cada pantalla vuelve a pedir todo lo suyo cada vez que se enfoca — y "enfocar"
 * incluye VOLVER a una pestaña que ya estaba montada. Medido con `meter.ts` en el ciclo de
 * referencia: 17 peticiones, con `/me/streak` pedida tres veces y `/tasks?date` otras tres.
 *
 * **La regla que lo hace seguro: lo guardado SIEMPRE se pinta al instante; el TTL solo decide si sale
 * una revalidacion por detras.** La app nunca queda mas desactualizada que hoy — deja de BLOQUEAR. Por
 * eso el TTL puede ser corto: no es el mecanismo de frescura, es la red de seguridad para cambios
 * hechos desde otro dispositivo. Lo que de verdad mantiene esto al dia es `invalidate` desde las
 * mutaciones.
 *
 * Es un store de MODULO con `useSyncExternalStore`, no un contexto — el mismo patron y el mismo
 * argumento que `constants/scheme-store.ts`. Aqui resuelve algo concreto: `useWorkspaces` esta montado
 * en cuatro sitios a la vez, cada uno hoy con su propio `useState`, y esas cuatro copias DIVERGEN al
 * mutar (borrar un espacio deja a las otras tres mintiendo hasta el siguiente foco). Con una sola
 * copia en un Map, los cuatro ven lo mismo en el mismo render.
 */

type Entry = {
  data: unknown;
  /** Cuando se guardo. 0 = invalidada a mano, o sea "pintala pero pide otra vez". */
  at: number;
  /** Ultima lectura, para la poda LRU. */
  readAt: number;
};

export type Policy = {
  /** Cuanto vale antes de revalidar por detras. */
  ttl: number;
  /** Si sobrevive al cierre de la app. */
  persist: boolean;
};

/** Lo que cambia a cada toque: la lista de un dia, el dia de hoy, las novedades. */
export const LIVE: Policy = { ttl: 15_000, persist: true };
/** Lo que cambia despacio: espacios, racha, estadisticas, caras, contadores. */
export const WARM: Policy = { ttl: 5 * 60_000, persist: true };
/** Lo que casi nunca cambia: miembros de un espacio, colaboradores. */
export const COLD: Policy = { ttl: 24 * 60 * 60_000, persist: true };

const FILE = 'tdapp-cache.json';
/** Presupuesto total en disco. Con lo medido sobra: stats de 119 dias son 5 KB. */
const BUDGET = 256 * 1024;
/**
 * Tope por entrada. Lo que lo pase vive en memoria pero NO se persiste.
 *
 * Es directamente para `/tasks?workspaceId`, que trae TODO el historico de un espacio sin LIMIT —
 * medido, 732 tareas son ~180 KB, o sea una sola entrada se comeria el 70% del presupuesto. Sigue
 * deduplicada y sigue sirviendose del cache dentro de la sesion; solo no sobrevive al reinicio.
 *
 * Es una tirita, y hay que decirlo: el arreglo de verdad es un LIMIT en el API.
 */
const MAX_ENTRY = 32 * 1024;
/** Un archivo mas grande que esto es corrupcion o una fuga: se tira y se arranca limpio. */
const MAX_FILE = 1024 * 1024;
/** Nunca una escritura por `set`: se juntan las de un mismo gesto. */
const WRITE_DEBOUNCE = 400;

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
/** Peticiones en vuelo, para que dos pantallas que piden lo mismo compartan UNA. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * De quien es lo guardado. Todas las llaves llevan `${owner}|` de prefijo.
 *
 * El token NUNCA entra en la llave: acabaria escrito en texto plano en el disco como parte de cada
 * entrada. `user.id` identifica igual de bien y no es un secreto.
 */
let owner = 0;
let hydrated = false;
let writeTimer: ReturnType<typeof setTimeout> | undefined;

const emit = (key: string) => listeners.get(key)?.forEach((fn) => fn());

// ------------------------------------------------------------------------------------------------
// Disco
// ------------------------------------------------------------------------------------------------

/**
 * El archivo del cache. En web no hay sistema de archivos: cae a `localStorage`, igual que ya hacen
 * `auth-context` y `scheme-store`.
 *
 * Va en `Paths.cache` y NO en `Paths.document`: `document` entra en la copia de seguridad de iCloud, y
 * sincronizar un cache de respuestas entre dispositivos es justo lo contrario de lo que se quiere. Que
 * iOS pueda desalojarlo bajo presion de disco es correcto por definicion — un desalojo degrada al
 * comportamiento de hoy, que es pedirlo todo.
 */
const disk = {
  read(): string | null {
    if (Platform.OS === 'web') return localStorage.getItem(FILE);
    const file = new File(Paths.cache, FILE);
    if (!file.exists) return null;
    // Si esta desbocado es corrupcion o fuga: se tira y se arranca limpio en vez de intentar parsearlo.
    if (file.size != null && file.size > MAX_FILE) {
      file.delete();
      return null;
    }
    return file.textSync();
  },
  write(text: string) {
    if (Platform.OS === 'web') return localStorage.setItem(FILE, text);
    const file = new File(Paths.cache, FILE);
    if (!file.exists) file.create({ intermediates: true });
    file.write(text);
  },
  clear() {
    if (Platform.OS === 'web') return localStorage.removeItem(FILE);
    const file = new File(Paths.cache, FILE);
    if (file.exists) file.delete();
  },
};

/**
 * Lee el disco. Se llama perezosamente en la primera lectura, que ocurre DURANTE el primer render.
 *
 * Sincrona a proposito, y es la razon de haber elegido `expo-file-system` sobre AsyncStorage: con una
 * API asincrona cada hook tendria que modelar un tercer estado "hidratando", que es exactamente el
 * `state.for` que este cache viene a borrar. Aqui no existe ese estado en ninguna parte.
 *
 * Todo dentro de un try: un archivo corrupto arranca la app vacia, nunca la tumba.
 */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const text = disk.read();
    if (!text) return;
    for (const [key, entry] of Object.entries(JSON.parse(text) as Record<string, Entry>)) {
      // Solo lo de esta cuenta. Cinturon ademas del tirante: aunque `reset()` fallara al cerrar
      // sesion, una cuenta no puede leer las llaves de otra.
      if (key.startsWith(`${owner}|`)) entries.set(key, entry);
    }
  } catch {
    disk.clear();
    entries.clear();
  }
}

/** Persiste con antirrebote. Poda por LRU hasta caber en el presupuesto. */
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, WRITE_DEBOUNCE);
}

export function flush() {
  clearTimeout(writeTimer);
  try {
    const keep: [string, Entry][] = [];
    let size = 0;

    // De la mas leida recientemente a la mas vieja: si hay que tirar algo, que sea lo que nadie mira.
    for (const [key, entry] of [...entries].sort((a, b) => b[1].readAt - a[1].readAt)) {
      const text = JSON.stringify(entry);
      if (text.length > MAX_ENTRY) continue;
      if (size + text.length > BUDGET) break;
      size += text.length;
      keep.push([key, entry]);
    }

    disk.write(JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // Quedarse sin guardar es aceptable: el proximo arranque pide todo, que es lo de hoy.
  }
}

// ------------------------------------------------------------------------------------------------
// API
// ------------------------------------------------------------------------------------------------

/** Quien es la persona. Lo llama `auth-context` al arrancar sesion. */
export function setOwner(id: number) {
  if (owner === id) return;
  owner = id;
  hydrated = false;
  entries.clear();
  hydrate();
}

/** Cierre de sesion: no queda nada de la cuenta anterior ni en memoria ni en disco. */
export function reset() {
  owner = 0;
  hydrated = true;
  entries.clear();
  inFlight.clear();
  errors.clear();
  try {
    disk.clear();
  } catch {
    // Da igual: el prefijo de owner ya impide leer lo ajeno.
  }
}

export const keyOf = (...parts: (string | number | null | undefined)[]) =>
  `${owner}|${parts.map((p) => p ?? '').join('|')}`;

/** Lectura sincrona, pensada para el render. `undefined` = nunca se ha guardado. */
export function read<T>(key: string): T | undefined {
  hydrate();
  const entry = entries.get(key);
  if (!entry) return undefined;
  entry.readAt = Date.now();
  return entry.data as T;
}

/** Si hace falta pedirlo otra vez. Sin entrada, o vencida, o invalidada a mano. */
export function isStale(key: string, policy: Policy): boolean {
  hydrate();
  const entry = entries.get(key);
  return !entry || Date.now() - entry.at > policy.ttl;
}

export function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(key);
  };
}

/** Escribe y avisa a quien este mirando esa llave. */
export function write<T>(key: string, data: T, persist = true) {
  const now = Date.now();
  entries.set(key, { data, at: now, readAt: now });
  emit(key);
  if (persist) scheduleWrite();
}

/**
 * Cambia lo guardado sin ir a la red. Es lo que hace posible la mutacion optimista.
 *
 * Si no hay nada guardado no hace nada: escribir a ciegas inventaria una lista a partir de un solo
 * elemento.
 */
export function patch<T>(key: string, updater: (old: T) => T) {
  const entry = entries.get(key);
  if (!entry) return;
  entry.data = updater(entry.data as T);
  emit(key);
  scheduleWrite();
}

/**
 * Marca como vencido lo que empiece por `prefix`, y refresca SOLO lo que alguien tenga en pantalla.
 *
 * Marca en vez de borrar: borrar dejaria en blanco las pantallas montadas. Y el filtro por
 * suscriptores es la mitad del ahorro — hoy `andSync` dispara tres GET sin preguntar si alguien esta
 * mirando. Lo que nadie mira se revalida cuando lo miren.
 */
export function invalidate(prefix: string) {
  const full = `${owner}|${prefix}`;
  for (const [key, entry] of entries) {
    if (!key.startsWith(full)) continue;
    entry.at = 0;
    if (listeners.has(key)) emit(key);
  }
}

/**
 * Pide el dato, compartiendo la peticion si ya hay una igual en vuelo.
 *
 * La deduplicacion es lo que arregla que `useWorkspaces` montado en cuatro sitios dispare cuatro
 * peticiones identicas a la vez.
 */
export function revalidate<T>(key: string, fetcher: () => Promise<T>, policy: Policy): Promise<T> {
  const running = inFlight.get(key);
  if (running) {
    track(key, 'dedup');
    return running as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      write(key, data, policy.persist);
      return data;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

// ------------------------------------------------------------------------------------------------
// Errores
// ------------------------------------------------------------------------------------------------

/**
 * El ultimo fallo de cada llave.
 *
 * Vive APARTE de las entradas y no se persiste, y las dos cosas son a proposito: un fallo de red es
 * de este intento, no del dato. Guardarlo con la entrada haria que sobreviviera al reinicio de la app
 * y que otra pantalla que lee la misma llave heredara un error que no le paso. Lo guardado se sigue
 * pintando por debajo mientras tanto.
 */
const errors = new Map<string, string>();
const errorListeners = new Map<string, Set<() => void>>();

export const readError = (key: string): string => errors.get(key) ?? '';

export function setError(key: string, message: string) {
  if ((errors.get(key) ?? '') === message) return;
  if (message) errors.set(key, message);
  else errors.delete(key);
  errorListeners.get(key)?.forEach((fn) => fn());
}

export function subscribeError(key: string, listener: () => void): () => void {
  const set = errorListeners.get(key) ?? new Set();
  set.add(listener);
  errorListeners.set(key, set);
  return () => {
    set.delete(listener);
    if (!set.size) errorListeners.delete(key);
  };
}

/**
 * Guarda al pasar a segundo plano.
 *
 * El antirrebote de 400 ms podria quedarse pendiente justo cuando la app se va, y ahi es cuando iOS
 * puede matarla sin avisar. Se registra al importar el modulo y no en un efecto: no pertenece a
 * ninguna pantalla.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'background') flush();
});
