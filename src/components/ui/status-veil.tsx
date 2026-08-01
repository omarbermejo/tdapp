import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScheme } from '@/constants/theme';

/** A cuantos px de scroll el velo ya esta del todo. Corto: tiene que responder al primer gesto. */
const VEIL_AT = 24;

/**
 * Cuanto difumina.
 *
 * Alto a proposito: mientras el contenido siga siendo LEGIBLE debajo del velo hay dos zonas que
 * comparar, y el ojo busca la linea que las separa. A 90 lo de arriba es color sin forma, asi que no
 * hay dos zonas — hay una que se apaga.
 */
const BLUR = 90;

/**
 * Cuanto se estira el desvanecido por debajo de la franja del sistema.
 *
 * El largo es lo que decide si se lee como un degradado o como un borde suavizado: corto, el ojo
 * todavia localiza donde acaba; a partir de una linea de texto de distancia deja de haber un
 * "donde".
 */
const FADE = 44;

/**
 * Cuantos puntos de control se generan para la curva del alfa.
 *
 * No son bandas: `LinearGradient` interpola entre ellos de forma continua, asi que ocho paradas
 * describen una curva y no una escalera. Con menos, los tramos rectos entre paradas empiezan a
 * notarse en la parte alta del degradado, que es donde el ojo tiene mas resolucion.
 */
const STOPS = 8;

/**
 * `smoothstep`: la curva en S clasica, con pendiente CERO en los dos extremos.
 *
 * Un gradiente lineal de opaco a transparente no se ve lineal. La percepcion del alfa no lo es, asi
 * que una rampa recta deja dos quiebres: uno arriba, donde el velo pasa de solido a empezar a caer,
 * y otro abajo, donde deja de caer de golpe al llegar a cero. Ese segundo quiebre es la "cola" que
 * todavia se distinguia.
 *
 * Con pendiente cero en ambos extremos el velo SALE de lo opaco y ENTRA en lo transparente sin que
 * haya un punto donde algo cambie de ritmo.
 */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * La franja del sistema, protegida.
 *
 * El reloj, el wifi y la bateria los pinta iOS ENCIMA de la app y con un color fijo; la app no puede
 * moverlos ni recolorearlos. Mientras el contenido no llegue ahi no pasa nada, pero en cuanto se
 * hace scroll cualquier cosa — un titulo de 34pt, un memoji, una tarjeta — pasa por debajo y el
 * reloj deja de leerse.
 *
 * **El desvanecido es una MASCARA, no capas apiladas.** El primer intento fue una pila de bandas de
 * blur con opacidad decreciente, y no daba el pego por dos motivos que no se arreglan subiendo el
 * numero de bandas: cada banda es una vista con su propio efecto, asi que el blur se recalcula por
 * tramo y las costuras se notan en el contenido con contraste; y una escalera de opacidades, por
 * fina que sea, sigue siendo una escalera. Aqui hay UN solo blur y lo que se degrada es su alfa,
 * pixel a pixel, que es como lo hacen las apps que sirvieron de referencia.
 *
 * `MaskedView` toma el alfa del `maskElement`: donde el gradiente es opaco el blur se ve entero,
 * donde es transparente desaparece. El gradiente va de negro a transparente — el COLOR da igual,
 * solo cuenta el alfa.
 *
 * Es el mismo velo del encabezado del calendario reducido a lo minimo: alli el blur separa una barra
 * de controles fija de la lista que corre por debajo, y aqui solo cubre el hueco del notch. La
 * diferencia importa — este NO fija nada, asi que el titulo se sigue yendo con la pagina.
 *
 * Invisible en reposo: sobre el canvas limpio seria una banda gris sin razon. Aparece cuando de
 * verdad hay algo que separar.
 */
export function StatusVeil({ scrollY }: { scrollY: SharedValue<number> }) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();

  const veil = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, VEIL_AT], [0, 1], 'clamp'),
  }));

  const height = insets.top + FADE;
  // Donde acaba la franja del sistema, en fraccion de la altura total. Hasta aqui el alfa es 1: el
  // reloj nunca cae dentro del degradado.
  const solid = insets.top / height;

  /*
    La curva, resuelta en paradas de color. El COLOR da igual —`MaskedView` solo lee el alfa— pero se
    escribe en negro porque es lo que espera quien lea esto despues.
  */
  const colors: string[] = ['#000'];
  const locations: number[] = [0];

  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    colors.push(`rgba(0,0,0,${(1 - smoothstep(t)).toFixed(3)})`);
    locations.push(solid + (1 - solid) * t);
  }

  return (
    <Animated.View style={[styles.veil, veil]} pointerEvents="none">
      <MaskedView
        style={{ height }}
        maskElement={
          <LinearGradient
            colors={colors as [string, string, ...string[]]}
            locations={locations as [number, number, ...number[]]}
            style={StyleSheet.absoluteFill}
          />
        }>
        <BlurView
          intensity={BLUR}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </Animated.View>
  );
}

/**
 * El shared value del scroll y los props para el `Animated.ScrollView` que lo alimenta.
 *
 * Va aqui y no copiado en cada pantalla porque las tres que lo usan escriben exactamente lo mismo, y
 * porque dos detalles se olvidan a la primera copia: el handler tiene que ser el de Reanimated —un
 * `onScroll` normal cruza al hilo de JS en cada frame y el velo va a tirones bajo carga— y
 * `scrollEventThrottle`, sin el cual en iOS el evento llega tan espaciado que el velo aparece a
 * saltos.
 */
export function useScrollVeil() {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  return { scrollY, scrollProps: { onScroll, scrollEventThrottle: 16 } };
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
});
