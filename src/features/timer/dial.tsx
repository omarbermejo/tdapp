import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';

/**
 * Una marca por minuto de un reloj: 60 se lee como una carátula sin tener que contarlas.
 *
 * Se exporta porque `dial-picker` lo usa como el techo del rango y como los minutos que cabe una
 * vuelta completa. Es la constante que hace que la carátula no mienta: una marca es un minuto al
 * elegir Y al correr.
 */
export const TICKS = 60;
const STEP = 360 / TICKS;

/** Diametro. Se exporta porque la pantalla centra la lectura encima y necesita la misma caja. */
export const DIAL = 264;

const TICK_LEN = 16;
const TICK_W = 4;
/** Las marcas no llegan al canto: un par de puntos de aire las lee como carátula y no como aro. */
const INSET = 3;

/**
 * La carátula del cronometro: un aro de marcas que se APAGA mientras el bloque corre.
 *
 * Sin `react-native-svg` en el proyecto, un arco de verdad habria que dibujarlo recortando medias
 * lunas con `overflow: hidden` y dos rotaciones encadenadas. Las marcas salen mas baratas y de
 * paso son mejores aqui: una marca que se apaga cada 25 segundos es un evento VISIBLE, y un arco
 * que se acorta un pelo por segundo no se ve moverse. Es lo mismo que hace un timer de cocina, y
 * es el idioma que la app ya usa para el dia (`DayCard` pinta un segmento por tarea).
 *
 * Se vacia hacia ATRAS, del final al principio: el frente del bloque retrocede hacia las 12 como
 * en un reloj de arena, no avanza como una barra que se llena. Lo que la caratula responde es
 * "cuanto me queda", no "cuanto llevo".
 *
 * Cada marca es una caja del tamaño del dial CON la marca pegada arriba al centro, y se rota la
 * caja entera: girar una caja cuadrada la gira sobre su centro, asi que la marca orbita el centro
 * del dial sin que haya que calcular ni un seno.
 *
 * `memo` no es adorno: son 60 vistas y la pantalla se repinta cuatro veces por segundo para mover
 * los digitos. Con `lit` como unica prop que cambia, el aro solo se repinta cuando de verdad se
 * apaga una marca — una vez cada `totalMs / 60`.
 */
export const Dial = memo(function Dial({
  lit,
  color,
  track,
}: {
  /** Marcas encendidas, 0..60. Son las que FALTAN. */
  lit: number;
  color: string;
  track: string;
}) {
  return (
    // El aro es decoracion: la lectura y el rol de progreso los pone la pantalla encima.
    <View style={styles.dial} pointerEvents="none" accessible={false}>
      {Array.from({ length: TICKS }, (_, i) => (
        <View key={i} style={[styles.slot, { transform: [{ rotate: `${i * STEP}deg` }] }]}>
          <View style={[styles.tick, { backgroundColor: i < lit ? color : track }]} />
        </View>
      ))}
    </View>
  );
});

/** Cuantas marcas quedan encendidas. Redondea hacia arriba: con tiempo vivo siempre queda una. */
export const litTicks = (leftMs: number, totalMs: number) =>
  totalMs <= 0 ? 0 : Math.ceil((Math.max(0, leftMs) / totalMs) * TICKS);

const styles = StyleSheet.create({
  dial: { width: DIAL, height: DIAL },
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DIAL,
    height: DIAL,
    alignItems: 'center',
  },
  tick: {
    width: TICK_W,
    height: TICK_LEN,
    marginTop: INSET,
    borderRadius: Radius.pill,
  },
});
