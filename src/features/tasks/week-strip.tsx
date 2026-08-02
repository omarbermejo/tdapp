import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Motion,
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useTheme,
  type Accent,
  type AccentName,
} from '@/constants/theme';
import { localDate } from '@/features/tasks/api';
import { dayLabel } from '@/features/tasks/day';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Fecha local desde 'YYYY-MM-DD'. `new Date('2026-07-30')` seria medianoche UTC y en America
 * corre el dia hacia atras; con el constructor de tres numeros no hay zona de por medio.
 */
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Los siete dias de la semana en curso, de lunes a domingo.
 *
 * `getDay()` devuelve 0 el domingo, asi que el desplazamiento al lunes es `(getDay() + 6) % 7`.
 * El constructor normaliza el desborde de mes y de año solo, igual que setDate.
 */
const weekOf = (date: string) => {
  const at = parse(date);
  const monday = at.getDate() - ((at.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => new Date(at.getFullYear(), at.getMonth(), monday + i));
};

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const long = (at: Date) =>
  at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

/** es-MX devuelve 'lun.' con punto; de ahi sale la inicial: L M M J V S D. */
const initial = (at: Date) =>
  upper(at.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')).charAt(0);

/** La tira se arma de lunes a domingo: 30ms por columna, 180ms de fundido cada una. */
const STAGGER = 30;
const FADE = 180;

/** Corto y con un pelin de rebote: el aro de hoy aterriza, no crece. */
const LAND = { damping: 15, stiffness: 320 };

/** El relleno viaja sin rebote: al ir y venir entre dias, un muelle aqui se siente nervioso. */
const TRAVEL = { duration: Motion.enter, easing: Easing.out(Easing.cubic) } as const;

/**
 * Siete columnas a `flex: 1`, asi que cada una mide exactamente un septimo de la fila. Con eso
 * el relleno se puede colocar en porcentajes y no hay que medir nada en JS.
 */
const SLOT = '14.2857%';

/**
 * El encabezado de semana del inicio: que dia esta viendo el usuario y donde cae en su semana.
 *
 * Es CONTROLADA: ni ancla el reloj ni guarda el dia elegido. Tocar un dia no navega a la agenda,
 * cambia el dia de la LISTA de abajo, asi que el elegido y hoy son dos cosas distintas y llevan dos
 * señales distintas: el elegido lleva el relleno del acento y hoy lleva el aro. Casi siempre coinciden
 * (relleno con aro); cuando no, se sigue viendo donde estas parado y donde estas mirando.
 *
 * **No navega a `/calendar` a proposito.** Esa agenda construye catorce dias HACIA ADELANTE desde hoy,
 * asi que de martes a domingo hasta seis de estas siete columnas son dias pasados que alla no existen:
 * tocar el lunes mandaria a una pantalla que no puede mostrarlo.
 *
 * Aqui vivio y se fue una vez, porque entonces Hoy y Planear eran la misma pantalla dos veces. Ya no:
 * en Hoy hay un mapa del trimestre, los espacios de trabajo y la racha, y Planear tiene el riel de
 * horas que aqui no esta.
 *
 * Estuvo a media pantalla haciendo de frontera —"de aqui abajo se habla del dia que miras"— y ahora
 * ABRE el inicio, encima del mapa de calor. Ya no separa nada: es el primer control de la pantalla, y
 * el dia que elige manda sobre todo lo que hay por debajo. El precio es que el mapa de calor y los
 * espacios quedan ENTRE el control y lo que controla, y esos dos hablan de siempre, no del dia
 * elegido; lo que lo hace legible es que la lista de abajo rotula su propio dia (`dayLabel`).
 */
export function WeekStrip({
  today,
  selected,
  onPickDay,
  accent,
  counts,
}: {
  today: string;
  selected: string;
  onPickDay: (date: string) => void;
  accent?: AccentName;
  /**
   * Cuantas tareas hay agendadas por dia, para el punto de densidad. Es el MISMO `byDay` que pinta el
   * mapa de calor de arriba, elevado a la pantalla y repartido: el mismo dato a dos escalas, una
   * peticion. Sin el, la tira no pide nada.
   */
  counts?: Map<string, number>;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  /**
   * El hook de reanimated, que es el mismo que usan `day-card`, `confetti` y `use-press-scale`.
   *
   * Lo que gana contra `AccessibilityInfo.isReduceMotionEnabled()` es que resuelve SINCRONO —lee una
   * constante que el nativo inyecta al arrancar— asi que no hay un primer frame en el que todavia no
   * se sabe si se puede animar, y no hace falta un estado que arranque en null.
   *
   * Lo que NO hace, y conviene saberlo antes de confiarse: no es reactivo. Su propio JSDoc dice que
   * cambiar la bandera del sistema no re-renderiza nada, porque devuelve el valor que habia AL
   * ARRANCAR la app. Encender "reducir movimiento" con la app abierta no se nota hasta reabrirla.
   * Es aceptable —nadie cambia ese ajuste a media sesion— pero si algun dia hace falta en vivo, el
   * camino es `AccessibilityInfo.addEventListener('reduceMotionChanged')`, no este hook.
   */
  const reduced = useReducedMotion();

  // La semana que se pinta es la del dia elegido, no la de hoy: si el elegido cayera en otra
  // semana, la tira tiene que estar mostrandolo o el usuario no ve donde esta parado.
  // Sin dia no se pinta ningun numero: seria una fecha inventada. Las dos filas reservan su
  // alto para que el primer frame no empuje la lista de tareas.
  const days = selected ? weekOf(selected) : [];
  const index = days.findIndex((day) => localDate(day) === selected);

  // El encabezado no se puede animar al montar (nace vacio, dentro del hueco reservado), asi
  // que su fundido lo dispara la llegada del dia, un frame antes que la primera columna.
  const headIn = useSharedValue(0);
  const at = useSharedValue(0);
  const land = useSharedValue(reduced ? 1 : 0.8);
  const placed = useSharedValue(false);

  useEffect(() => {
    if (!selected) return;
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    headIn.set(reduced ? 1 : withTiming(1, { duration: FADE }));
  }, [selected, reduced, headIn]);

  useEffect(() => {
    if (index < 0) return;
    // Ya hay relleno en pantalla: no vuelve a nacer en el dia nuevo, viaja hasta el.
    if (placed.get()) {
      at.set(reduced ? index : withTiming(index, TRAVEL));
      return;
    }
    placed.set(true);
    at.set(index);
    land.set(reduced ? 1 : withDelay(index * STAGGER, withSpring(1, LAND)));
  }, [index, reduced, at, land, placed]);

  const head = useAnimatedStyle(() => ({ opacity: headIn.get() }));
  // translateX en porcentaje es del ancho del propio riel, que ya es un septimo de la fila:
  // la columna i esta a i veces su propio ancho.
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: `${at.get() * 100}%` }] }));
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: land.get() }] }));

  /*
    SIN papel debajo, y eso es un cambio con historia.

    Estuvo dentro de una `Card` —papel levantado con sombra— cuando la tira vivia a media pantalla y
    tenia que recalcarse contra lo que la rodeaba. Ahora abre el inicio, pegada al titular del dia, y
    ahi el papel sobra por dos motivos: no hay nada de lo que separarse, y una card justo debajo de la
    fecha se lee como un objeto MAS en vez de como la continuacion de la cabecera.

    Lo que queda es el mismo control con el mismo lenguaje: relleno del acento en el elegido, aro en
    hoy, punto de densidad debajo. Se probaron y se descartaron en su momento BlurView (es el lenguaje
    del velo del calendario, y aqui no hay scroll que velar), un subrayado que viaja (competiria con el
    relleno, que ya viaja) y el numero del elegido en Fraunces grande (cambiaria de tamaño al tocar y
    moveria la fila entera).

    El `gap` NO es decorativo: era el de la `Card`. Sin el, la cabecera "Hoy / AGOSTO" se pega a la fila
    de dias, porque `styles.head` y `styles.week` son hermanos sueltos sin aire propio.
  */
  return (
    <View style={styles.strip}>
      <Animated.View style={[styles.head, head]}>
        <Text style={[Type.section, { color: t.text }]}>{dayLabel(selected, today)}</Text>
        {/* Type.micro ya va en mayusculas: 'julio' sale 'JULIO'. */}
        <Text style={[Type.micro, { color: t.textMuted }]}>
          {selected ? parse(selected).toLocaleDateString('es-MX', { month: 'long' }) : ''}
        </Text>
      </Animated.View>

      <View style={styles.week}>
        {days.length > 0 && (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.slot, slide]}>
            {/* Fantasmas: le copian el ritmo vertical a la celda para que el relleno caiga
                exactamente sobre el numero, sin medir alturas. Son DOS porque la celda tiene tres
                hijos (inicial, circulo y punto de densidad) — con uno solo el relleno quedaria
                media linea mas abajo que su numero. */}
            <Text style={[Type.micro, styles.ghost]}>L</Text>
            <Animated.View style={[styles.dot, { backgroundColor: tint.soft }, fill]} />
            <View style={styles.load} />
          </Animated.View>
        )}

        {days.map((day, i) => (
          <Day
            key={localDate(day)}
            at={day}
            index={i}
            isToday={localDate(day) === today}
            isSelected={localDate(day) === selected}
            reduced={reduced}
            tint={tint}
            onPickDay={onPickDay}
            load={counts?.get(localDate(day)) ?? 0}
          />
        ))}
      </View>
    </View>
  );
}

/** Componente aparte porque cada dia necesita sus propios shared values. */
function Day({
  at,
  index,
  isToday,
  isSelected,
  reduced,
  tint,
  onPickDay,
  load,
}: {
  at: Date;
  index: number;
  isToday: boolean;
  isSelected: boolean;
  reduced: boolean;
  tint: Accent;
  onPickDay: (date: string) => void;
  /** Cuantas tareas tiene agendadas ese dia. 0 no pinta punto. */
  load: number;
}) {
  const t = useTheme();
  // Soft y no el Light por omision: el golpe de bajada solo acompaña, el que confirma la
  // eleccion es el selectionAsync de onPress.
  const press = usePressScale({ to: 0.9, haptic: Haptics.ImpactFeedbackStyle.Soft });

  const enter = useSharedValue(reduced ? 1 : 0);
  const land = useSharedValue(isToday && !reduced ? 0.8 : 1);

  // El dedo abajo se guarda en estado y no se escribe al shared value desde el handler: el
  // compilador de React solo acepta mutarlos dentro de un efecto.
  const [held, setHeld] = useState(false);
  const heldAt = useSharedValue(0);
  useEffect(() => {
    heldAt.set(withTiming(held ? 1 : 0, { duration: held ? 120 : 180 }));
  }, [held, heldAt]);

  useEffect(() => {
    if (reduced) {
      enter.set(1);
      land.set(1);
      return;
    }
    enter.set(withDelay(index * STAGGER, withTiming(1, { duration: FADE })));
    // El aro de hoy llega con su columna, no antes: la tira sigue leyendose de izquierda a derecha.
    if (isToday) land.set(withDelay(index * STAGGER, withSpring(1, LAND)));
  }, [reduced, index, isToday, enter, land]);

  /*
    La opacidad viaja en su propio estilo porque `press.style` escribe `transform`: en un array
    de estilos la ultima clave gana, y mezclar las dos en un solo objeto borraria la escala.
  */
  const column = useAnimatedStyle(() => ({ opacity: enter.get() }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: land.get() }] }));

  // El numero se tiñe mientras el dedo esta abajo: en un objetivo de 34pt la escala sola se
  // pierde debajo del pulgar. El elegido ya nace en tinta, encima de su relleno.
  const base = isSelected ? tint.ink : isToday ? t.text : t.textMuted;
  // base y tint entran en las dependencias: al cambiar el esquema el worklet tiene que releerlos.
  const number = useAnimatedStyle(
    () => ({ color: interpolateColor(heldAt.get(), [0, 1], [base, tint.ink]) }),
    [base, tint.ink]
  );

  return (
    <Animated.View style={[styles.col, column, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${long(at)}${isToday ? ', hoy' : ''}${loadLabel(load)}`}
        accessibilityHint="Muestra las tareas de este día"
        accessibilityState={{ selected: isSelected }}
        onPress={() => {
          // En web no hay motor haptico; el catch evita ensuciar la consola.
          Haptics.selectionAsync().catch(() => {});
          onPickDay(localDate(at));
        }}
        onPressIn={() => {
          press.onPressIn();
          setHeld(true);
        }}
        onPressOut={() => {
          press.onPressOut();
          setHeld(false);
        }}
        style={styles.cell}>
        <Text style={[Type.micro, { color: t.textMuted }]}>{initial(at)}</Text>
        <Animated.View
          style={[
            styles.dot,
            ring,
            // Hoy es el aro, el relleno es el elegido. Sin fondo propio, porque el relleno que
            // pasa por debajo es el que viaja: si la celda tambien lo pintara, no viajaria nada.
            isToday && { borderWidth: 2, borderColor: tint.ink },
          ]}>
          {/* La serif, y a numeros tabulares para que el relleno no baile al llegar. */}
          <Animated.Text style={[Type.dayNum, number]}>{String(at.getDate())}</Animated.Text>
        </Animated.View>

        {/*
          El punto de densidad: se alimenta del MISMO byDay que el mapa de arriba, asi que la tira y el
          mapa son el mismo dato a dos escalas. El hueco se reserva siempre (un punto transparente)
          para que un dia con tareas y uno sin ellas midan igual y la fila no se mueva al cambiar de
          semana. Sin numero: cuantas son ya lo dice la lista de abajo, aqui solo importa si hay algo.
        */}
        <View
          style={[styles.load, load > 0 && { backgroundColor: isSelected ? tint.ink : t.textMuted }]}
        />
      </Pressable>
    </Animated.View>
  );
}

/** Lo que el lector de pantalla añade al dia. Vacio cuando no hay nada: el silencio ya lo dice. */
const loadLabel = (load: number) =>
  load === 0 ? '' : load === 1 ? ', 1 tarea' : `, ${load} tareas`;

/** Circulo del dia: mismo ancho que alto, porque con Radius.pill un rectangulo saldria pastilla. */
const DOT = 34;

/** El punto de densidad. 4pt se ve bajo un circulo de 34 sin competir con el numero. */
const LOAD = 4;

const styles = StyleSheet.create({
  // El aire que ponia la `Card` que envolvia esto. Ver el comentario del return.
  strip: { gap: Space.md },
  // Baseline y no centro: el mes es una micro-etiqueta que se apoya en la linea del nombre del dia.
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: Type.section.lineHeight,
  },
  week: { flexDirection: 'row', minHeight: Touch.icon },
  // Sin ancho fijo: siete columnas a flex reparten el ancho del telefono que sea, sin scroll.
  col: { flex: 1 },
  cell: { minHeight: Touch.icon, alignItems: 'center', justifyContent: 'center', gap: Space.xs },
  // El riel del relleno: fuera del flujo, con la misma caja que una celda.
  slot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SLOT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  ghost: { opacity: 0 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sin color: lo pone la celda solo si ese dia tiene algo. El hueco se reserva igual.
  load: { width: LOAD, height: LOAD, borderRadius: Radius.pill },
});
