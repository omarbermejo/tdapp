import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro, SectionHeader } from '@/components/ui/card';
import { Space, Type, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';

import { TaskRow } from './task-row';
import type { useToday } from './use-today';

/**
 * El dia entero, en filas.
 *
 * Antes esto era "el resto del dia" y escondia la tarea que la tarjeta de arriba ya pintaba.
 * Al irse la tarjeta ya no hay heroe que evitar: la lista es la pantalla, asi que tambien carga
 * con la espera, el fallo y el dia vacio, que antes vivian en la tarjeta.
 *
 * Las hechas bajan al final en gris: siguen ahi porque ver lo que ya hiciste es la mitad del
 * premio, pero no compiten con lo que falta.
 */
export function TodayList({ day }: { day: ReturnType<typeof useToday> }) {
  const t = useTheme();
  const { today, loading, error, reload } = day;

  if (loading && !today) {
    return (
      <Card>
        <Micro>Hoy</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>Trayendo tu día…</Text>
      </Card>
    );
  }

  if (error && !today) {
    return (
      <Card>
        <Micro>Hoy</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
        <BigButton label="Reintentar" variant="ghost" onPress={reload} />
      </Card>
    );
  }

  const accent = today?.user.accentColor;
  const pending = today?.tasks.filter((task) => task.status === 'pending') ?? [];
  const done = today?.tasks.filter((task) => task.status === 'done') ?? [];
  const ordered: Task[] = [...pending, ...done];

  // Un solo mensaje cuando no hay nada: antes salian dos, uno debajo del otro, diciendo lo mismo.
  if (ordered.length === 0) {
    return (
      <Card>
        <Text style={[Type.section, { color: t.text }]}>Nada para hoy.</Text>
        <Text style={[Type.body, { color: t.textMuted }]}>
          Lo que anotes con el + aparece aquí, de una en una.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.block}>
      <SectionHeader
        title="Hoy"
        hint={pending.length > 0 ? `${pending.length} por hacer.` : 'Todo hecho.'}
      />

      {ordered.map((task) => (
        <TaskRow key={task.id} task={task} accent={accent} reload={reload} />
      ))}

      {/* Un fallo con la lista ya en pantalla no borra la pantalla: se avisa y se sigue leyendo. */}
      {!!error && <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md },
  notice: { paddingHorizontal: Space.xs },
});
