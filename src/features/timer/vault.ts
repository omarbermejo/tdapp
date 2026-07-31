import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * El bloque en curso, guardado en el telefono.
 *
 * Existe porque el cronometro NO puede vivir solo en memoria: enfocarse veinticinco minutos significa
 * dejar el telefono, iOS mata las apps al fondo cuando le hace falta memoria, y al volver el bloque
 * arrancaba de cero. Peor: la Live Activity de esa sesion se quedaba huerfana (la referencia en
 * memoria murio con el proceso, asi que ya no habia forma de cerrarla) y se acumulaban hasta que iOS
 * dejaba de crear nuevas — de ahi que la isla dejara de aparecer despues de un par de vueltas.
 *
 * Lo que se guarda es el instante ABSOLUTO del final, no lo que queda: es lo unico que sigue siendo
 * cierto despues de que la app estuvo horas cerrada.
 *
 * ponytail: SecureStore es de mas para esto (un cronometro no es un secreto), pero es el unico
 * almacen ya instalado y el repo ya lo usa asi en `auth-context`. Techo: si algun dia entra
 * AsyncStorage por otra cosa, esto se muda ahi.
 */

const KEY = 'tdapp.timer';

export type Saved = {
  phase: 'focus' | 'short' | 'long';
  focusMs: number;
  totalMs: number;
  /** Epoch del final. `null` = armado o en pausa. */
  endsAt: number | null;
  leftMs: number;
  done: number;
  /** Id de la tarea enganchada, para reengancharla al volver. `null` = bloque libre. */
  taskId: number | null;
};

// SecureStore no existe en web; localStorage cubre el caso de dev, igual que en `auth-context`.
const raw = {
  get: (): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(KEY))
      : SecureStore.getItemAsync(KEY),
  set: (value: string): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(KEY, value))
      : SecureStore.setItemAsync(KEY, value),
  clear: (): Promise<void> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(KEY))
      : SecureStore.deleteItemAsync(KEY),
};

/** Nunca lanza: un cronometro que no se pudo guardar sigue corriendo en memoria. */
export async function saveBlock(saved: Saved) {
  try {
    await raw.set(JSON.stringify(saved));
  } catch {
    // Sin almacen, el bloque simplemente no sobrevive al cierre. No es motivo para tumbar nada.
  }
}

/** Lo guardado, o `null` si no hay nada o esta corrupto. Nunca lanza. */
export async function loadBlock(): Promise<Saved | null> {
  try {
    const value = await raw.get();
    if (!value) return null;
    const parsed = JSON.parse(value) as Saved;
    // Se valida lo minimo para no rehidratar basura: un `totalMs` de 0 dividiria por cero en el dial.
    if (!parsed || typeof parsed.totalMs !== 'number' || parsed.totalMs <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearBlock() {
  try {
    await raw.clear();
  } catch {
    // Nada que borrar.
  }
}
