import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * La preferencia de tema de la app: seguir al sistema, o forzar claro u oscuro.
 *
 * Es un store a nivel de módulo con `useSyncExternalStore` y NO un contexto de React, a propósito:
 * `useScheme()` lo consume, y de `useScheme()` cuelgan `useTheme`, `useAccent`, `useShadow` y
 * `useNavTheme` — o sea el color de la app entera. Como contexto habría que envolver el árbol y
 * cualquier componente que se montara fuera del proveedor se quedaría sin tema; así, el hook no tiene
 * dependencias de árbol y funciona desde cualquier sitio.
 *
 * `useSyncExternalStore` es la API que React trae justo para esto, y garantiza que todos los
 * suscriptores ven el mismo valor en el mismo render — que es lo que evita que la cápsula de pestañas
 * se quede un frame en el tema viejo mientras el resto ya cambió.
 */

/** `system` es el default y el que respeta lo que el teléfono ya decidió. */
export type Preference = 'system' | 'light' | 'dark';

const KEY = 'tdapp.scheme';

const ORDER: Preference[] = ['system', 'light', 'dark'];

let preference: Preference = 'system';
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

// SecureStore no existe en web; localStorage cubre el caso, igual que en `auth-context`.
const raw = {
  get: (): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(KEY))
      : SecureStore.getItemAsync(KEY),
  set: (value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(KEY, value))
      : SecureStore.setItemAsync(KEY, value),
};

const valid = (value: string | null): value is Preference =>
  value === 'system' || value === 'light' || value === 'dark';

/** Para `useSyncExternalStore`. Devuelve la MISMA referencia mientras no cambie. */
export const getPreference = (): Preference => preference;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Lee lo guardado. Se llama una vez al arrancar la app.
 *
 * Mientras no haya leído, la preferencia es `system` — que es el default correcto, así que un arranque
 * con la lectura a medias no parpadea al tema equivocado: parpadearía solo si el usuario forzó un tema
 * distinto al del sistema, y ahí el salto dura lo que tarda el Keychain.
 */
export async function hydratePreference() {
  try {
    const value = await raw.get();
    if (valid(value) && value !== preference) {
      preference = value;
      emit();
    }
  } catch {
    // Sin almacén se queda en `system`, que es lo que haría la app sin este archivo.
  }
}

/** Fija la preferencia. Repinta al instante y guarda detrás. */
export function setPreference(next: Preference) {
  if (next === preference) return;
  preference = next;
  emit();
  // No se espera: el color ya cambió y que el guardado tarde no debe retenerlo.
  void raw.set(next).catch(() => {});
}

/**
 * Pasa a la siguiente de las tres. Es lo que hace el icono de un toque.
 *
 * Ciclar y no alternar entre dos: con un interruptor de dos posiciones no habría forma de volver a
 * "seguir al sistema" una vez que se sale, y ese es el estado que respeta lo que el teléfono ya sabe
 * (modo oscuro por horario, por ejemplo). Cada uno de los tres tiene su propio icono, así que el ciclo
 * no es adivinanza.
 */
export function cyclePreference() {
  setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]);
}
