/**
 * Lo que comparten los widgets. SOLO tipos y funciones puras.
 *
 * No importa nada de `@expo/ui` ni de `constants/theme` a proposito: este archivo lo lee la app
 * (para armar los props) y su contenido tiene que poder viajar por `JSON.stringify`, que es como
 * `updateSnapshot` cruza al proceso de la extension.
 *
 * OJO — el layout de un widget se SERIALIZA como fuente y se evalua suelto en un JSContext pelado:
 * no captura nada de fuera de su propia funcion. Asi que nada de aqui se puede usar DENTRO de un
 * layout; esto es para el lado de la app. Lo que el layout necesita, viaja en los props.
 */

/** El acento en sus dos pasos legibles, uno por esquema. Lo resuelve `accentInks()` en la app. */
export type Inks = {
  /** Para cuando el widget se dibuja sobre material claro. */
  tint: string;
  /** Para cuando se dibuja sobre material oscuro. Lo elige la extension, no la app. */
  tintDark: string;
};

/**
 * Una tarea aplanada a lo minimo que un widget puede pintar.
 *
 * Sin objetos anidados ni `Date`: no sobreviven el viaje. La hora llega ya formateada porque el
 * layout no puede llamar a `toLocaleTimeString` con la locale del usuario — corre fuera de la app.
 */
export type WidgetTask = {
  id: number;
  title: string;
  /** '18:00' o '' si no tiene hora. */
  time: string;
  done: boolean;
};

/** 'HH:MM' con el reloj del telefono, o '' si la tarea no tiene hora. */
export const timeOf = (dueAt: string | null): string =>
  dueAt
    ? new Date(dueAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '';

/**
 * Recorta un titulo para que no empuje a sus hermanos fuera de la fila.
 *
 * El `lineLimit(1)` del layout ya trunca, pero recortar antes ahorra que SwiftUI mida un texto de 120
 * caracteres para tirar 100: en un widget pequeño eso se nota en el reparto de espacio.
 */
export const short = (title: string, max: number): string =>
  title.length > max ? `${title.slice(0, max - 1)}…` : title;
