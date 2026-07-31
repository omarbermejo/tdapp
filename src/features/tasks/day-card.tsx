import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CAPTURE_TAG } from './capture-tag';
import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { dayLabel } from './day';
import { accentForFocus } from './focus-accent';
import type { useTasks } from './use-tasks';

/** Entrada de cada segmento: sube y aparece, sin viaje. */
const ENTER = { duration: 260, easing: Easing.out(Easing.cubic) } as const;

/** El escalonado se corta a los 6 segmentos: con un dia largo la barra tardaba en armarse. */
const STEP_MS = 40;
const STEP_CAP = 6;

/** ζ≈1: llega y se queda. El usuario pidió suavizar, así que nada de rebote. */
const SETTLE = { damping: 22, stiffness: 200, mass: 0.6 } as const;

/** Proporcion del viewBox del sticker: escala por ancho sin deformarse. */
const BUBBLE_RATIO = 101 / 91;

/**
 * "Reducir movimiento" del sistema.
 *
 * Arranca en `null` a proposito: con la bandera encendida, asumir que si hay motor deja
 * correr la animacion un frame antes de saberlo. Mientras es null nadie anima.
 */
function useMotionAllowed(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => setAllowed(!reduce))
      .catch(() => setAllowed(true));
  }, []);

  return allowed;
}

const missing = (n: number) => (n === 1 ? 'Falta una' : `Faltan ${n}`);

/**
 * Hechas primero.
 *
 * En el orden del servidor los segmentos llenos salian salpicados entre los vacios y la barra
 * no se leia como progreso, solo como cinco pastillas de colores. Llenando desde la izquierda
 * el titular y la barra dicen lo mismo con dos lenguajes. Se pierde el orden del dia, pero eso
 * ya lo cuenta la lista de abajo, que si esta ordenada.
 */
const filledFirst = (tasks: Task[]) => [
  ...tasks.filter((task) => task.status === 'done'),
  ...tasks.filter((task) => task.status !== 'done'),
];

/**
 * La linea que acompaña al numero, y que NUNCA repite el numero.
 *
 * El titular ya dice "2 de 5"; aqui va lo que ese dato no dice: cuanto queda, o qué hacer
 * cuando no has empezado. El dia cerrado es el unico premio del dia y se lo dice sin números.
 */
const dayLine = (total: number, done: number) => {
  const pending = total - done;
  if (pending === 0) return 'Día cerrado. Ya no debes nada.';
  if (done === 0) return 'Empieza por la más chica.';
  return `${missing(pending)}. ${done >= pending ? 'Ya vas de bajada.' : 'Vas bien.'}`;
};

/**
 * Un dia vacio no es un fracaso, y no significa lo mismo en los tres tiempos.
 *
 * Hoy todavia se puede llenar; el futuro es una agenda en blanco, no una deuda; y del pasado no
 * se pide nada — pedirle "agenda algo" al martes que ya paso es un regaño con forma de consejo.
 */
const EMPTY = {
  today: { title: 'Nada para hoy', line: 'El día cabe entero. Anota una cosa y ya tiene forma.' },
  future: { title: 'Nada agendado', line: 'Ese día está libre. Lo que apuntes para entonces sale aquí.' },
  past: { title: 'No hubo nada', line: 'Ese día pasó en blanco. No quedó nada pendiente.' },
} as const;

/**
 * Un segmento = una tarea.
 *
 * Vive en su propio componente porque `useAccent` es un hook y la barra sale de un `.map()`:
 * llamarlo ahi dentro seria un hook por iteración, o sea una cuenta distinta cada vez que el
 * dia cambia de largo.
 *
 * Relleno en `solid` y no en `ink`: el segmento no lleva texto, y `solid` es justo el paso
 * decorativo de la rampa. `ink` esta calibrado para leerse, lo que en claro empuja el clay a
 * un marrón y borra la señal de "este dia es de vida"; y en oscuro `ink` es el paso MÁS claro
 * de la rampa, que se lee lavado. `solid` mantiene el croma en los dos esquemas.
 */
function Segment({
  task,
  fallback,
  index,
  motion,
}: {
  task: Task;
  fallback: AccentName;
  index: number;
  motion: boolean | null;
}) {
  const t = useTheme();
  const tint = useAccent(accentForFocus(task.focusArea, fallback));
  const done = task.status === 'done';

  const enter = useSharedValue(0);
  const fill = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    if (motion === null) return;
    enter.value = motion ? withDelay(Math.min(index, STEP_CAP) * STEP_MS, withTiming(1, ENTER)) : 1;
  }, [motion, index, enter]);

  useEffect(() => {
    fill.value = withTiming(done ? 1 : 0, { duration: 240 });
  }, [done, fill]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    // Crece desde el centro: una barra que se llena, no una fila de cosas que caen.
    transform: [{ scaleX: 0.7 + 0.3 * enter.value }],
    backgroundColor: interpolateColor(fill.value, [0, 1], [t.sunken, tint.solid]),
  }));

  return <Animated.View style={[styles.segment, style]} />;
}

/**
 * El dia que estas viendo de un vistazo: cuántas van, de qué es el dia, y el único botón sólido
 * de la pantalla. Ya no es "hoy": el dia lo manda la tira de la semana por `selected`, y el
 * encabezado lo dice con su nombre — sin eso, la tarjeta mentiria en cuanto tocas otro dia.
 *
 * La barra es segmentada y no un anillo ni un porcentaje. No hay react-native-svg para dibujar
 * un arco, pero sobre todo: con pocas tareas al dia un segmento por tarea dice dos cosas a la
 * vez — cuántas son y de qué familia de foco es cada una — y un 40% no dice ninguna.
 *
 * El botón de anotar vive FUERA del cuerpo condicional: así ningún estado (cargando, fallo,
 * dia vacio, en progreso, dia cerrado) puede dejar la pantalla sin la única forma de crear una
 * tarea, que es lo que acaba de salir de la barra de pestañas.
 */
export function DayCard({
  day,
  today,
  selected,
  onCapture,
}: {
  day: ReturnType<typeof useTasks>;
  today: string;
  selected: string;
  onCapture: () => void;
}) {
  const t = useTheme();
  const motion = useMotionAllowed();
  const { user } = useAuth();
  const { tasks, loading, error, reload } = day;

  // Los conteos se cuentan aqui: `/tasks?date=` devuelve el dia pelado, sin el resumen que traia
  // `/me/today`. `tasks === null` es "todavia no llego" y no "esta vacio"; quien los distingue
  // es `loading`, y de eso depende que la tarjeta no parpadee al cambiar de dia.
  const total = tasks?.length ?? 0;
  const done = tasks?.filter((task) => task.status === 'done').length ?? 0;
  const segments = filledFirst(tasks ?? []);
  // El acento sale de la sesion; `olive` es el mismo default que usa `useAccent`.
  const accent: AccentName = user?.accentColor ?? 'olive';

  const relative = dayLabel(selected, today);
  // En el dia de hoy sigue siendo "TU DÍA": es la pantalla de inicio y suena a tuya, no a fecha.
  const heading = !selected || selected === today ? 'Tu día' : relative;
  // Comparar cadenas 'YYYY-MM-DD' ya ordena por fecha; sin dia anclado se asume hoy.
  const when = !selected || !today || selected === today ? 'today' : selected > today ? 'future' : 'past';

  // Los hooks van todos arriba, antes de cualquier rama: el cuerpo de la tarjeta cambia de
  // estado (cargando → dia) y una rama con hooks propios reventaria en ese cambio.
  const pop = useSharedValue(1);
  useEffect(() => {
    if (motion !== true) return;
    // El golpecito del número es el premio inmediato de marcar una tarea; sin él, marcar
    // desde la lista de abajo no se siente en ninguna parte.
    pop.value = withSequence(
      withTiming(1.08, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, SETTLE)
    );
  }, [done, motion, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  let body: ReactNode;

  if (loading && !tasks) {
    body = (
      <Text style={[Type.body, { color: t.textMuted }]}>
        {when === 'today' ? 'Trayendo tu día…' : 'Trayendo ese día…'}
      </Text>
    );
  } else if (error && !tasks) {
    body = (
      <>
        <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
        <BigButton label="Reintentar" variant="ghost" onPress={reload} />
      </>
    );
  } else if (total === 0) {
    // Aqui vive EL mensaje de dia vacio de la pantalla: `TodayList` devuelve null cuando no hay
    // tareas justo para que no salgan dos tarjetas diciendo lo mismo, una debajo de la otra.
    // Sin número: "0 de 0" no es un progreso, y el sticker ocupa el hueco mejor que un cero.
    body = (
      <>
        <Image
          source={require('@/assets/stickers/bubble.svg')}
          style={styles.sticker}
          contentFit="contain"
          accessible={false}
        />
        <Text style={[Type.section, { color: t.text }]}>{EMPTY[when].title}</Text>
        <Text style={[Type.body, { color: t.textMuted }]}>{EMPTY[when].line}</Text>
      </>
    );
  } else {
    body = (
      <>
        {/* `metric` y no `display`: el saludo del home ya es un display de 34 y dos titulares
            de ese tamaño en la misma pantalla pelean en vez de ordenar. */}
        <Animated.Text style={[Type.metric, popStyle, { color: t.text }]}>
          {done} de {total}
        </Animated.Text>
        <Text style={[Type.body, { color: t.textMuted }]}>{dayLine(total, done)}</Text>

        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Progreso de ${(relative || 'hoy').toLowerCase()}`}
          accessibilityValue={{ min: 0, max: total, now: done }}
          style={[styles.bar, total > 10 && styles.barTight]}>
          {segments.map((task, i) => (
            <Segment key={task.id} task={task} fallback={accent} index={i} motion={motion} />
          ))}
        </View>
      </>
    );
  }

  return (
    <Card>
      <Micro>{heading}</Micro>
      {body}
      {/*
        El boton VIAJA a la pantalla de nueva tarea: `sharedTransitionTag` lo empareja con el
        "Crear" de alla (`new-task.tsx`), asi que al abrirla la pastilla oscura se desliza de aqui
        hasta su sitio en vez de que una pantalla tape a la otra.

        Se emparejan estos dos y no el boton con el campo del titulo porque son la MISMA cosa: la
        accion. Y de paso los dos son una pastilla oscura del mismo radio y del mismo color, asi que
        el morph se lee como un objeto que se mueve y no como dos cosas distintas cruzandose.

        La etiqueta no cambia a "Agendar" en los dias futuros: la captura no recibe el dia
        seleccionado, asi que prometer que agenda para el viernes seria mentira.
      */}
      <Animated.View sharedTransitionTag={CAPTURE_TAG}>
        <BigButton label="Anotar algo" onPress={onCapture} style={styles.cta} />
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingVertical: Space.xs },
  // Un dia muy largo con 4pt de aire por hueco se come el ancho de los propios segmentos.
  barTight: { gap: 2 },
  segment: { flex: 1, height: 12, borderRadius: Radius.pill },
  // Chico y centrado: acompaña al mensaje, no se vuelve la ilustracion de la pantalla.
  sticker: { width: 88, aspectRatio: BUBBLE_RATIO, alignSelf: 'center', marginTop: Space.xs },
  // El CTA cierra la tarjeta: un paso más de aire lo separa del dato y lo deja como acción.
  cta: { marginTop: Space.xs },
});
