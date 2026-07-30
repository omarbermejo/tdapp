import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Space, Type, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { FOCUS_AREAS } from '@/features/auth/options';

import { useToday } from './use-today';

/** Re-render cada segundo, solo mientras algo corre. */
function useTick(active: boolean) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

const clock = (total: number) => {
  const s = Math.max(0, total);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
};

const focusLabel = (value: string | null) =>
  value ? (FOCUS_AREAS.find((o) => o.value === value)?.label ?? value) : null;

/** "25 min · Trabajo", sin el separador colgando cuando la tarea no tiene foco. */
const meta = (task: Task) => [`${task.suggestedMinutes} min`, focusLabel(task.focusArea)].filter(Boolean).join(' · ');

/**
 * Lo unico que el home pone al frente: la cosa que sigue, o la que esta corriendo.
 *
 * Una app para no distraerse no puede abrir con una lista de doce pendientes — la lista ES la
 * distraccion. Aqui hay una sola tarea y una sola accion; el resto del dia se resume en una
 * linea debajo.
 */
export function NowCard() {
  const t = useTheme();
  const { today, error, loading, fetchedAt, reload, toggleTimer } = useToday();

  const task = today?.running ?? today?.next ?? null;
  const running = !!today?.running;
  useTick(running);

  // El servidor manda los segundos ya sumados; desde que llegaron, los contamos aqui.
  const elapsed = task ? task.elapsedSeconds + (running ? Math.floor((Date.now() - fetchedAt) / 1000) : 0) : 0;

  if (loading && !today) {
    return (
      <Card>
        <Micro>Ahora</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>Trayendo tu día…</Text>
      </Card>
    );
  }

  if (error && !today) {
    return (
      <Card>
        <Micro>Ahora</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
        <BigButton label="Reintentar" variant="ghost" onPress={reload} />
      </Card>
    );
  }

  return (
    <View style={styles.block}>
      <Card>
        <Micro>{running ? 'En curso' : 'Ahora'}</Micro>

        {task ? (
          <>
            <Text style={[Type.title, { color: t.text }]} numberOfLines={2}>
              {task.title}
            </Text>

            {running ? (
              <View style={styles.timer}>
                <Text style={[Type.display, { color: t.text }]}>{clock(elapsed)}</Text>
                <Text style={[Type.hint, { color: t.textMuted }]}>{`de ${task.suggestedMinutes} min`}</Text>
              </View>
            ) : (
              <Text style={[Type.hint, { color: t.textMuted }]}>{meta(task)}</Text>
            )}

            <BigButton
              label={running ? 'Pausar' : 'Empezar'}
              variant={running ? 'outline' : 'primary'}
              onPress={() => toggleTimer(task.id, running ? 'stop' : 'start')}
            />
          </>
        ) : (
          <>
            <Text style={[Type.title, { color: t.text }]}>Nada para hoy.</Text>
            <Text style={[Type.body, { color: t.textMuted }]}>
              Lo que anotes aparece aquí, de una en una.
            </Text>
          </>
        )}
      </Card>

      {/* El resto del dia en una linea: saber cuanto queda sin tener que verlo todo. */}
      {!!today && today.counts.total > 0 && (
        <Text style={[Type.hint, styles.counts, { color: t.textMuted }]}>
          {[
            today.counts.pending > 0 &&
              `${today.counts.pending} ${today.counts.pending === 1 ? 'pendiente' : 'pendientes'}`,
            today.counts.done > 0 && `${today.counts.done} ${today.counts.done === 1 ? 'hecha' : 'hechas'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {/* Un fallo con datos ya en pantalla no borra la pantalla: se avisa y se puede reintentar. */}
      {!!error && !!today && (
        <Text style={[Type.hint, styles.counts, { color: t.danger }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md },
  timer: { gap: Space.xs },
  counts: { paddingHorizontal: Space.xs },
});
