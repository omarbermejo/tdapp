import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';

import { SectionHeader } from '@/components/ui/card';
import { Motion, Space, Type, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { dayLabel } from './day';
import { TaskRow } from './task-row';
import type { useTasks } from './use-tasks';

/**
 * El viaje de una fila cuando la lista se reordena.
 *
 * Es LA animacion de esta pantalla: al marcar algo la fila baja al grupo de hechas, y sin esto
 * el salto es un corte de un frame. Instancia unica y fuera del render porque cambiar la
 * referencia del prop `layout` en cada render vuelve a registrar la animacion en el nativo.
 */
const ROW_LAYOUT = LinearTransition.springify().damping(22).stiffness(240);

/** Borrar tampoco corta: la fila se apaga y las de abajo suben con ROW_LAYOUT. */
const ROW_EXIT = FadeOut.duration(Motion.exit);

/**
 * La lista se arma de arriba a abajo en vez de aparecer de golpe.
 *
 * `entering` solo dispara al MONTAR, asi que recargar el MISMO dia no lo repite: reconcilia las
 * mismas filas por `key={task.id}`. Cambiar de dia si lo repite, porque son otras tareas y por
 * tanto otras filas — y ahi ayuda: el dia nuevo se arma de arriba a abajo en vez de parpadear.
 * El escalon se topa a 8 justo para eso: un dia largo entra completo en ~360ms.
 *
 * ReduceMotion.System ya es el default de reanimated; va explicito porque esta es la unica
 * animacion grande de la pantalla y quien la lea tiene que ver que respeta el ajuste.
 */
const rowEntering = (index: number) =>
  FadeInDown.delay(Math.min(index, 8) * 45)
    .duration(Motion.enter)
    .reduceMotion(ReduceMotion.System);

/**
 * El dia que estas viendo, en filas.
 *
 * Ya no es "hoy": la tira de la semana cambia `selected` sin salir de la pantalla, asi que el
 * encabezado dice de que dia habla ('Hoy', 'Mañana', 'Lunes 27') en vez de mentir con "Hoy".
 *
 * Sin filas devuelve `null`, y lo mismo mientras carga o si falla: de eso se encarga la card de
 * arriba, que ya tiene el sticker y el boton de anotar. Dos mensajes apilados diciendo lo mismo
 * es el bug que ya arreglamos una vez en esta pantalla.
 *
 * Las hechas bajan al final en gris: siguen ahi porque ver lo que ya hiciste es la mitad del
 * premio, pero no compiten con lo que falta.
 */
export function TodayList({
  day,
  today,
  selected,
}: {
  day: ReturnType<typeof useTasks>;
  today: string;
  selected: string;
}) {
  const t = useTheme();
  const { user } = useAuth();
  const { tasks, error, reload } = day;

  const pending = tasks?.filter((task) => task.status === 'pending') ?? [];
  const done = tasks?.filter((task) => task.status === 'done') ?? [];
  const ordered: Task[] = [...pending, ...done];

  if (ordered.length === 0) return null;

  return (
    <View style={styles.block}>
      {/* Sin hint: la card de arriba ya cuenta el dia y el mismo numero dos veces a 100pt de
          distancia solo invita a compararlos. */}
      <SectionHeader title={dayLabel(selected, today)} />

      {ordered.map((task, i) => (
        <Animated.View
          key={task.id}
          layout={ROW_LAYOUT}
          entering={rowEntering(i)}
          exiting={ROW_EXIT}>
          <TaskRow task={task} accent={user?.accentColor} reload={reload} />
        </Animated.View>
      ))}

      {/* El unico fallo que se avisa aqui: uno con las filas ya en pantalla. La card solo cuenta
          el fallo cuando no tiene nada que pintar, asi que en este caso nadie mas lo diria. */}
      {!!error && <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md },
  notice: { paddingHorizontal: Space.xs },
});
