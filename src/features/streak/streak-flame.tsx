import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import Flame from "lucide-react-native/icons/flame";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  Motion,
  Space,
  Type,
  useAccent,
  useTheme,
  type AccentName,
} from "@/constants/theme";
import type { Streak } from "@/features/auth/api";

import { levelsOf, todayIndexOf } from "./streak";

/**
 * Una vuelta entera necesita mas que `Motion.enter` (220) para leerse como GIRO: a 220ms el ojo ve un
 * tiron y no una rotacion. 520 es donde se lee la vuelta completa sin que la insignia se vuelva el
 * centro de la pantalla.
 */
const LIGHT = { duration: 520, easing: Easing.out(Easing.cubic) } as const;

/** ζ≈1: el numero llega y se queda. El mismo muelle que usaba el numero de la tarjeta del dia. */
const SETTLE = { damping: 22, stiffness: 200, mass: 0.6 } as const;

/** El tamaño del glifo. 22 es lo que usa el panel del swipe: un icono que acompaña texto. */
const GLYPH = 22;

/**
 * La racha del dia, como insignia: el fuego y el numero.
 *
 * Compacta e independiente de `StreakCard`, que sigue viviendo en el perfil. Son dos altitudes del
 * MISMO dato —la insignia que se comprueba a diario y el detalle de la semana— y las dos leen
 * `streak.ts`, asi que la regla de que cuenta como racha se decide en un solo sitio.
 *
 * El icono es un SF Symbol y no un `Icon3D`: los 3D traen el color HORNEADO y no aceptan `tintColor`,
 * asi que no pueden pasar de apagado a encendido, que es justo lo que esta insignia tiene que hacer.
 * El fallback es el `Flame` de Lucide, importado por su subpath — nunca del barril, que mete 1756
 * modulos.
 */
export function StreakFlame({
  streak,
  accent,
}: {
  streak: Streak | null;
  accent?: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const reduced = useReducedMotion();

  /**
   * Encendida = hoy ya cerraste algo.
   *
   * Sale de `levelsOf`, que ya resuelve los cuatro estados de un dia, en vez de volver a comparar
   * `week[i].done > 0` aqui: es la doctrina de `clemencyLine` —hoy no cuenta hasta que cierres algo, y
   * tampoco la rompe— y duplicarla haria que el mismo martes se viera distinto en la insignia y en la
   * tarjeta del perfil.
   */
  const lit = !!streak && levelsOf(streak)[todayIndexOf(streak)] === "closed";
  const days = streak?.days ?? 0;

  const spin = useSharedValue(0);
  const pop = useSharedValue(1);

  /**
   * `seen` distingue "acabas de encenderla" de "ya estaba encendida cuando abriste la app".
   *
   * Un `useRef(lit)` sencillo NO sirve, y el fallo es silencioso: `useStreak` arranca en
   * `{ streak: null }` a proposito, asi que `lit` empieza en false y cuando llega la respuesta de un
   * dia que YA habias cerrado, el efecto veria false -> true y la llama daria la vuelta entera. O sea
   * que giraria en cada arranque en frio de la app, todos los dias, sin que nada hubiera pasado.
   *
   * Con el guard, la primera llegada del dato solo PINTA el estado final. El giro es un premio y un
   * premio que se reparte al abrir la app deja de ser un premio.
   */
  const seen = useRef(false);

  useEffect(() => {
    if (!streak) return;

    if (!seen.current) {
      seen.current = true;
      return;
    }
    if (!lit) return;

    /*
      El color NO se anima, y no es una renuncia: `tintColor` de `SymbolView` es una prop nativa y no un
      estilo, asi que no hay shared value que pueda cruzarla. Salta — y salta EN EL MISMO INSTANTE en
      que arranca el giro, asi que las dos cosas se leen como UN cambio y no como dos. Es el mismo
      argumento con el que la casilla de una tarea cambia de borde punteado a solido de golpe:
      coincidir con otro cambio es lo que hace que un salto no se vea como un salto.

      El giro es celebracion y se va con "reducir movimiento"; el color se queda, porque el color es
      informacion (la racha esta activa) y eso tiene que verse igual con el ajuste encendido.
    */
    if (!reduced) {
      spin.set(0); // Reinicia para que la animación de escala funcione siempre.
      spin.set(withTiming(1, LIGHT));
    }

    // El mismo golpe que confirma un `BigButton` con exito. Solo al encenderse, nunca al montar.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  }, [streak, lit, reduced, spin]);

  /** El golpecito del numero al subir la racha. Se reusa el de la tarjeta del dia. */
  useEffect(() => {
    if (reduced || !days) return;
    pop.set(
      withSequence(
        withTiming(1.12, {
          duration: Motion.pop,
          easing: Easing.out(Easing.quad),
        }),
        withSpring(1, SETTLE),
      ),
    );
  }, [days, reduced, pop]);

  /**
   * Un solo shared value maneja el giro Y la crecida: el seno vale 0 en los extremos y 1 a la mitad,
   * asi que el fuego se hincha en medio de la vuelta y vuelve a su tamaño al terminar. Eso es lo que
   * hace que se lea como que PRENDE en vez de solo rotar.
   */
  const flame = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.get() * 360}deg` },
      { scale: 1 + 0.12 * Math.sin(spin.get() * Math.PI) },
    ],
  }));

  const number = useAnimatedStyle(() => ({
    transform: [{ scale: pop.get() }],
  }));

  /*
    `ink` y no `solid`: un glifo de 22pt esta mas cerca de texto que de relleno —hay que LEERLO— e `ink`
    es el unico paso de la rampa que pasa AA 4.5:1 en los dos esquemas. Apagado va en `textMuted`, que
    es el gris con el que la app dice "esto todavia no".
  */
  const color = lit ? tint.ink : t.textMuted;

  // Sin racha no se pinta un cero: `headlineOf(0)` tampoco lo hace, y un 0 en la esquina de la
  // pantalla de inicio se lee como un reproche diario. Se queda el fuego apagado, que es la verdad.
  return (
    <View accessible accessibilityLabel={label(days, lit)} style={styles.badge}>
      <Animated.View style={flame}>
        <SymbolView
          name={{
            ios: "flame.fill",
            android: "local_fire_department",
            web: "whatshot",
          }}
          size={GLYPH}
          tintColor={color}
          // Lucide en Android y web. `color` es prop y no estilo, asi que recibe el mismo paso final:
          // el glifo gira dentro de la vista de fuera igual que el SF Symbol.
          fallback={<Flame size={GLYPH} strokeWidth={2} color={color} />}
        />
      </Animated.View>

      {days > 0 && (
        <Animated.Text style={[Type.label, styles.days, number, { color }]}>
          {days}
        </Animated.Text>
      )}
    </View>
  );
}

/** Lo que lee un lector de pantalla. El fuego solo no diria nada. */
const label = (days: number, lit: boolean) => {
  if (days === 0) return "Sin racha todavía";
  const run = days === 1 ? "1 día de racha" : `${days} días de racha`;
  return lit
    ? `${run}. Hoy ya cerraste algo.`
    : `${run}. Hoy todavía está abierto.`;
};

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  // tabular-nums para que el 9 -> 10 no mueva el fuego de sitio.
  days: { fontVariant: ["tabular-nums"] },
});
