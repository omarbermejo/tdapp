import { Image } from 'expo-image';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { SectionHeader } from '@/components/ui/card';
import { Motion, RESHAPE, Space, Type, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { tasksApi } from './api';
import { dayLabel } from './day';
import { GRIP, SortableTasks } from './sortable-list';
import { TaskRow } from './task-row';
import type { useTasks } from './use-tasks';

/**
 * El viaje de una fila cuando la lista se reordena.
 *
 * Es LA animacion de esta pantalla: al marcar algo la fila baja al grupo de hechas, y sin esto
 * el salto es un corte de un frame. Instancia unica y fuera del render porque cambiar la
 * referencia del prop `layout` en cada render vuelve a registrar la animacion en el nativo.
 */

/** Borrar tampoco corta: la fila se apaga y las de abajo suben con ROW_LAYOUT. */
const ROW_EXIT = FadeOut.duration(Motion.exit);

/**
 * La lista se arma de arriba a abajo en vez de aparecer de golpe.
 *
 * `entering` solo dispara al MONTAR, asi que recargar el MISMO dia no lo repite: reconcilia las
 * mismas filas por `key={task.id}`. Cambiar de dia si lo repite, porque son otras tareas y por
 * tanto otras filas — y ahi ayuda: el dia nuevo se arma de arriba a abajo en vez de parpadear.
 *
 * El escalon es `Motion.step` (30ms) y no los 45 de antes, y el tope baja de 8 a 6: los 45 eran una
 * SEGUNDA constante de escalonado compitiendo con la del sistema, y 8 x 45 = 360ms de armado son
 * demasiados en la pantalla que se abre veinte veces al dia. Ahora entra completa en 180ms y toda la
 * app escalona con el mismo numero — el tope de 6 es el mismo `STEP_CAP` que usaba la barra del dia.
 *
 * ReduceMotion.System ya es el default de reanimated; va explicito porque esta es la unica
 * animacion grande de la pantalla y quien la lea tiene que ver que respeta el ajuste.
 */
const rowEntering = (index: number) =>
  FadeInDown.delay(Math.min(index, 6) * Motion.step)
    .duration(Motion.enter)
    .reduceMotion(ReduceMotion.System);

/** Proporcion del viewBox del sticker: escala por ancho sin deformarse. */
const STICKER_RATIO = 87 / 99;

/**
 * Un dia vacio no es un fracaso, y no significa lo mismo en los tres tiempos.
 *
 * Hoy todavia se puede llenar; el futuro es una agenda en blanco, no una deuda; y del pasado no se
 * pide nada — pedirle "agenda algo" al martes que ya paso es un regaño con forma de consejo.
 *
 * Vivia en `day-card`, que era quien pintaba el vacio del dia. Al quitar esa tarjeta esto se mudo
 * aqui entero, porque si no la pantalla se quedaba MUDA en un dia sin tareas.
 */
const EMPTY = {
  today: { title: 'Nada para hoy', line: 'El día cabe entero. Anota una cosa y ya tiene forma.' },
  future: { title: 'Nada agendado', line: 'Ese día está libre. Lo que apuntes para entonces sale aquí.' },
  past: { title: 'No hubo nada', line: 'Ese día pasó en blanco. No quedó nada pendiente.' },
} as const;

/**
 * El dia que estas viendo, en filas.
 *
 * El encabezado dice de que dia habla ('Hoy', 'Mañana', 'Lunes 27') porque la tira de la semana cambia
 * `selected` sin salir de la pantalla, asi que decir "Hoy" siempre seria mentira.
 *
 * **Esta seccion es la unica que habla del dia, y por eso carga con sus TRES estados**: cargando, el
 * fallo con su boton de reintentar, y el vacio. Antes los pintaba la tarjeta del dia y esta lista
 * devolvia `null` para no repetir el mensaje — pero al quitar esa tarjeta, `null` dejaba la pantalla en
 * silencio justo en su modo de falla mas comun: sin red, el inicio mostraba el mapa y los espacios y
 * nada mas, sin explicacion y sin forma de reintentar.
 *
 * Sigue habiendo UN solo mensaje de vacio en la pantalla, que es el bug que ya se arreglo una vez aqui.
 *
 * Las pendientes se pueden REORDENAR arrastrando; las hechas bajan al final en gris y no se arrastran.
 * Siguen ahi porque ver lo que ya hiciste es la mitad del premio, pero no compiten con lo que falta — y
 * un orden manual entre cosas cerradas no significa nada.
 */
export function TodayList({
  day,
  today,
  selected,
  onDragChange,
}: {
  day: ReturnType<typeof useTasks>;
  today: string;
  selected: string;
  /** Apaga el scroll de la pantalla mientras se arrastra una fila. */
  onDragChange: (dragging: boolean) => void;
}) {
  const t = useTheme();
  const { user, token } = useAuth();
  const { tasks, loading, error, reload } = day;

  const pending = tasks?.filter((task) => task.status === 'pending') ?? [];
  const done = tasks?.filter((task) => task.status === 'done') ?? [];
  const total = pending.length + done.length;

  /**
   * Guarda el orden nuevo. Optimista con el patron exacto de `task-row`: pinta YA, manda detras, y
   * deshace si el servidor rechaza.
   *
   * Vive AQUI y no en `SortableTasks` porque el estado local guarda el dia ENTERO y esa lista solo ve
   * las pendientes: escribir solo `next` borraria las cerradas de la pantalla hasta la siguiente
   * recarga. De ahi el `[...next, ...done]`.
   *
   * Al API se le mandan solo los ids de las pendientes, y con eso basta: el `ORDER BY` pone
   * `status = 'done'` primero, asi que lo cerrado baja al final tenga posicion o no.
   */
  const saveOrder = (next: Task[]) => {
    if (!token || !tasks) return;
    const undo = day.reorder([...next, ...done], tasks);

    void (async () => {
      try {
        await tasksApi.order(
          token,
          next.map((task) => task.id)
        );
      } catch {
        undo();
        Alert.alert('No pudimos guardar el orden', 'Inténtalo otra vez.');
      }
    })();
  };

  // Comparar cadenas 'YYYY-MM-DD' ya ordena por fecha; sin dia anclado se asume hoy.
  const when = !selected || !today || selected === today ? 'today' : selected > today ? 'future' : 'past';

  // `tasks === null` es "todavia no llego" y no "esta vacio"; quien los distingue es `loading`.
  const heading = <SectionHeader title={dayLabel(selected, today)} hint={total ? `${done.length} de ${total}` : undefined} />;

  if (loading && !tasks) {
    return (
      <View style={styles.block}>
        {heading}
        <Text style={[Type.body, { color: t.textMuted }]}>
          {when === 'today' ? 'Trayendo tu día…' : 'Trayendo ese día…'}
        </Text>
      </View>
    );
  }

  /*
    El fallo con nada que pintar. Es el UNICO sitio de la pantalla con un boton de reintentar, y por eso
    no puede faltar: `tasks === null` con error es exactamente lo que pasa cuando se abre la app sin red.
  */
  if (error && !tasks) {
    return (
      <View style={styles.block}>
        {heading}
        <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
        <BigButton label="Reintentar" variant="ghost" onPress={reload} />
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.block}>
        {heading}
        {/* Sin número: "0 de 0" no es un progreso, y el sticker ocupa el hueco mejor que un cero. */}
        <View style={styles.empty}>
          <Image
            source={require('@/assets/stickers/hourglass.svg')}
            style={styles.sticker}
            contentFit="contain"
            accessible={false}
          />
          <Text style={[Type.section, { color: t.text }]}>{EMPTY[when].title}</Text>
          <Text style={[Type.body, styles.emptyLine, { color: t.textMuted }]}>{EMPTY[when].line}</Text>
        </View>
      </View>
    );
  }

  /*
    Sin `accessibilityRole="progressbar"` en el contenedor, aunque la tarjeta del dia lo tuviera: alli
    era un nodo hoja con un numero dentro, y aqui el contenedor tiene doce filas que TIENEN que ser
    accesibles una por una. Marcarlo como progressbar las tragaria todas en un solo nodo.

    El dato no se pierde: el `hint` del encabezado dice "3 de 5" como texto visible, asi que VoiceOver
    lo lee al entrar en la seccion. Es la misma informacion sin robarle la lista a nadie.
  */
  return (
    <View style={styles.block}>
      {heading}

      {/* Las pendientes, arrastrables. `SortableTasks` pone el asa fuera del swipe de cada fila. */}
      {pending.length > 0 && (
        <SortableTasks
          tasks={pending}
          accent={user?.accentColor}
          mutate={day}
          onReorder={saveOrder}
          onDragChange={onDragChange}
        />
      )}

      {/* Las hechas: sin asa y con la entrada escalonada de siempre. */}
      {done.map((task, i) => (
        <Animated.View
          key={task.id}
          layout={RESHAPE}
          entering={rowEntering(pending.length + i)}
          exiting={ROW_EXIT}
          style={styles.doneRow}>
          <TaskRow task={task} accent={user?.accentColor} mutate={day} />
        </Animated.View>
      ))}

      {/* El unico fallo que se avisa aqui: uno con las filas ya en pantalla. */}
      {!!error && <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md },
  /**
   * Las hechas se alinean con las pendientes aunque no tengan asa: sin esto la lista se escalona en
   * dos margenes y se lee como dos listas distintas en vez de una con un final.
   */
  doneRow: { paddingLeft: GRIP },
  empty: { gap: Space.sm, alignItems: 'center', paddingVertical: Space.sm },
  // Chico y centrado: acompaña al mensaje, no se vuelve la ilustracion de la pantalla.
  sticker: { width: 76, aspectRatio: STICKER_RATIO },
  emptyLine: { textAlign: 'center' },
  notice: { paddingHorizontal: Space.xs },
});
