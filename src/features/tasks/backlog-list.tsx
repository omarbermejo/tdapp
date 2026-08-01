import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { SectionHeader } from '@/components/ui/card';
import { Motion, Space, Type, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { TaskRow } from './task-row';
import type { useBacklog } from './use-tasks';

const ROW_LAYOUT = LinearTransition.springify().damping(22).stiffness(240);
const ROW_EXIT = FadeOut.duration(Motion.exit);

/**
 * Lo que quedo atras, arriba de todo en Hoy.
 *
 * Es la seccion que tapa el agujero: antes, una tarea pendiente de ayer o una anotada sin fecha no
 * aparecian en NINGUNA pantalla de la app. Va arriba y no abajo porque lo que se te paso es lo
 * primero que hay que decidir — si se hace hoy o si se suelta.
 *
 * El tono no castiga, igual que el resto del copy: dice cuantas son y que se pueden mover, no que
 * fallaste. Una lista que regaña se deja de abrir, y entonces vuelve a haber un agujero.
 *
 * Sin nada atras no pinta nada. Es la mitad del punto: el dia limpio se ve limpio.
 */
export function BacklogList({ backlog }: { backlog: ReturnType<typeof useBacklog> }) {
  const t = useTheme();
  const { user } = useAuth();
  const { tasks, reload } = backlog;

  if (!tasks?.length) return null;

  // Lo vencido primero y lo que nunca tuvo fecha al final: entre "se me paso el martes" y "esto
  // existe desde hace tiempo", lo primero es mas urgente y lo segundo mas facil de soltar.
  const overdue = tasks.filter((task) => task.dueDate);
  const undated = tasks.filter((task) => !task.dueDate);
  const ordered: Task[] = [...overdue, ...undated];

  return (
    <View style={styles.block}>
      <SectionHeader title="Antes de hoy" hint={hint(overdue.length, undated.length)} />

      {ordered.map((task) => (
        <Animated.View key={task.id} layout={ROW_LAYOUT} exiting={ROW_EXIT}>
          {/*
            Con dia y SIN hora. La meta de la fila cabe en tres segmentos a una linea, y aqui son
            cuatro: el cuarto se cortaba a medias ("31 jul · 25 min · Creatividad · 5:0…"), que es
            peor que no estar.
            El que se va es la hora, y no por espacio: la hora de un dia que ya paso no acciona
            nada — "5:00 p.m." del martes no te dice cuando hacerla, te dice cuando NO la hiciste.
            Lo que decide aqui es de que dia es, para moverla o soltarla.
          */}
          <TaskRow task={task} accent={user?.accentColor} reload={reload} showDay showTime={false} />
        </Animated.View>
      ))}

      <Text style={[Type.hint, styles.note, { color: t.textMuted }]}>
        Muévelas a hoy o suéltalas. Las dos cuentan.
      </Text>
    </View>
  );
}

/** Cuenta lo que hay sin ponerle adjetivos. "3 atrasadas · 1 sin fecha". */
const hint = (overdue: number, undated: number) =>
  [
    overdue && `${overdue} de otros días`,
    undated && `${undated} sin fecha`,
  ]
    .filter(Boolean)
    .join(' · ');

const styles = StyleSheet.create({
  block: { gap: Space.md },
  note: { paddingHorizontal: Space.xs },
});
