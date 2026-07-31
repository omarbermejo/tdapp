import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { DIAL, TICKS } from './dial';

/**
 * Elegir los minutos girando la carátula, como un timer de cocina de cuerda.
 *
 * Antes eran tres chips (5/25/50) en una tarjeta debajo. Funcionaban, pero ponían la decisión en un
 * sitio distinto del reloj y limitaban a tres valores porque un chip por minuto era imposible.
 * Girando, el control ES el reloj: se ve el número crecer en el centro y las marcas encenderse
 * mientras el dedo da la vuelta, y el enganche por minuto se siente en la mano.
 *
 * **Una vuelta completa = 60 minutos**, o sea una marca por minuto. Esa equivalencia es lo que hace
 * que la carátula no mienta nunca: las marcas encendidas son los minutos elegidos, y cuando el
 * bloque arranca esas mismas marcas son los minutos que quedan.
 *
 * El rango se queda en 1..60 por eso mismo. Con un techo de 90 la carátula tendría que representar
 * 90 minutos en 60 marcas y una marca dejaría de ser un minuto.
 */
const MIN = 1;
const MAX = TICKS;

const CENTER = DIAL / 2;
const TAU = Math.PI * 2;

/**
 * El ángulo del dedo respecto al centro, con 0 en las 12 y creciendo en el sentido del reloj.
 *
 * Es `atan2(dx, -dy)` y no el `atan2(dy, dx)` de siempre: el de siempre pone el 0 a las 3 y crece
 * en contra del reloj (porque en pantalla la y crece hacia abajo). Intercambiar los argumentos y
 * voltear la y rota el origen a las 12 y endereza el sentido, que es como se lee un reloj.
 */
const angleAt = (x: number, y: number) => {
  'worklet';
  return Math.atan2(x - CENTER, CENTER - y);
};

/**
 * La zona muerta del centro. Sin ella, un dedo que cruza el centro salta media vuelta en un frame:
 * ahí el ángulo es indefinido y un pixel de diferencia cambia el resultado en 180 grados.
 */
const DEAD_ZONE = 44;

export function DialPicker({
  minutes,
  onChange,
  children,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  /** La carátula. Va como hijo para que este componente no sepa cómo se pinta. */
  children: React.ReactNode;
}) {
  /** Radianes acumulados desde que empezó el gesto. Acumula vueltas: girar dos veces suma 120. */
  const turn = useSharedValue(0);
  /** El ángulo del frame anterior, para sacar el delta. */
  const previous = useSharedValue(0);
  /** Los minutos al empezar el gesto: el giro se suma SOBRE esto, no sobre cero. */
  const base = useSharedValue(minutes);
  /** El último minuto avisado, para no repetir el haptico ni el render en cada frame. */
  const last = useSharedValue(minutes);

  /**
   * Un minuto cruzado. El haptico y el aviso van juntos en el hilo de JS: `Haptics` no es un
   * worklet, y separarlos en dos `runOnJS` haría dos saltos de hilo por cada minuto.
   */
  const commit = useCallback(
    (value: number) => {
      // Ligero y seco: es el click del dial, no la confirmación de un botón.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(value);
    },
    [onChange]
  );

  /**
   * `minDistance(0)` para que el giro empiece con el primer movimiento: el default espera a que el
   * dedo se aleje en línea recta, y un arco corto sobre la carátula nunca lo cumplía.
   */
  const rotate = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      base.set(last.get());
      turn.set(0);
      previous.set(angleAt(event.x, event.y));
    })
    .onUpdate((event) => {
      const dx = event.x - CENTER;
      const dy = event.y - CENTER;
      // Dentro de la zona muerta no se acumula, pero TAMPOCO se reancla el ángulo previo: al salir
      // el dedo sigue desde donde estaba y no se cuenta el trayecto por el centro como un giro.
      if (dx * dx + dy * dy < DEAD_ZONE * DEAD_ZONE) return;

      const angle = angleAt(event.x, event.y);
      let delta = angle - previous.get();
      // Desenvuelve el salto de +PI a -PI al cruzar las 12: sin esto, pasar por arriba resta una
      // vuelta entera de golpe.
      if (delta > Math.PI) delta -= TAU;
      if (delta < -Math.PI) delta += TAU;
      previous.set(angle);

      turn.set(turn.get() + delta);

      const raw = base.get() + (turn.get() / TAU) * TICKS;
      /**
       * El acumulado se recorta contra el límite, no solo el resultado. Si solo se recortara el
       * número, seguir girando pasado el 60 acumularía "deuda" invisible y habría que devolver todo
       * ese giro antes de que el dial bajara del 60 — se siente como un control roto.
       */
      if (raw < MIN) turn.set(((MIN - base.get()) / TICKS) * TAU);
      if (raw > MAX) turn.set(((MAX - base.get()) / TICKS) * TAU);

      const next = Math.min(MAX, Math.max(MIN, Math.round(raw)));
      if (next === last.get()) return;
      last.set(next);
      runOnJS(commit)(next);
    });

  /**
   * VoiceOver no puede girar nada, así que el dial se declara ajustable y responde a los gestos de
   * incremento y decremento del lector. Sin esto el control sería inalcanzable, y mantener los
   * chips solo para eso duplicaría la misma decisión en dos sitios de la pantalla.
   */
  const step = (delta: number) => {
    const next = Math.min(MAX, Math.max(MIN, minutes + delta));
    if (next === minutes) return;
    last.set(next);
    commit(next);
  };

  return (
    <GestureDetector gesture={rotate}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Minutos de enfoque"
        accessibilityValue={{ min: MIN, max: MAX, now: minutes, text: `${minutes} minutos` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') step(1);
          if (nativeEvent.actionName === 'decrement') step(-1);
        }}
        accessibilityHint="Gira la carátula para cambiar cuánto dura el bloque"
        style={styles.wrap}>
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  /**
   * `alignSelf` importa: la carátula suelta se centra ella misma, pero envuelta aquí el que manda es
   * esta caja, y con ancho fijo dentro de un contenedor `stretch` se quedaba pegada a la izquierda —
   * o sea que el dial se descentraba solo al poder girarse.
   */
  wrap: { width: DIAL, height: DIAL, alignSelf: 'center' },
});
