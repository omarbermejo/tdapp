import { useEffect } from 'react';

/**
 * Aviso de "las tareas cambiaron" entre pantallas que no se conocen.
 *
 * Existe porque el boton de anotar vive en la barra de `(app)/_layout` y desde ahi no hay forma
 * de alcanzar el `reload` de la pantalla que esta debajo: no son padre e hijo, son dos ramas del
 * navegador. `useFocusEffect` no alcanza tampoco, porque anotar no cambia el foco.
 *
 * ponytail: un Set de callbacks en vez de un cache de verdad. Techo: cuando haya varias
 * pantallas pidiendo rangos distintos y duela que TODAS recarguen, aqui entra react-query y
 * esto se borra.
 */
const listeners = new Set<() => void>();

/** Llamalo despues de crear, marcar o borrar desde fuera de la pantalla que las pinta. */
export const tasksChanged = () => {
  // Sobre una copia: un listener que se desmonte durante el aviso no rompe el recorrido.
  [...listeners].forEach((notify) => notify());
};

/**
 * Corre `handler` con cada `tasksChanged()`. Una suscripcion de verdad y no un contador en las
 * deps de un efecto: el contador no se usaba dentro del callback, asi que era una dependencia
 * que solo servia de disparador — y eso el lint lo canta, con razon.
 */
export function useOnTasksChanged(handler: () => void) {
  useEffect(() => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [handler]);
}
