import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Micro } from '@/components/ui/card';
import { Icon3D, Icon3DSize } from '@/components/ui/icon3d';
import { Radius, Space, Type, useAccent, useShadow, useTheme } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { usePressScale } from '@/hooks/use-press-scale';

import { accentForFocus, focusOf } from './focus-accent';
import type { useTasks } from './use-tasks';

/**
 * Lo siguiente, y solo lo siguiente.
 *
 * El API ya calculaba este dato y la app lo ignoraba: `/me/today` devuelve `next` desde siempre —
 * la pendiente con hora mas cercana, o la primera si ninguna tiene hora. Es el campo mas accionable
 * del endpoint y no tenia pantalla.
 *
 * Se calcula aqui con la misma regla en vez de llamar a `/me/today`, porque la lista del dia ya
 * esta cargada y pedir el mismo dia dos veces por un solo campo es una peticion de mas.
 *
 * Una tarjeta, un titulo, un boton. Con TDAH la pregunta que paraliza no es "que tengo que hacer"
 * —eso lo dice la lista— es "por cual empiezo": esto la responde por ti y deja la lista para
 * cuando quieras discutirlo.
 */
export function NextUp({ day }: { day: ReturnType<typeof useTasks> }) {
  const t = useTheme();
  const { user } = useAuth();
  const shadow = useShadow('raised');
  const press = usePressScale();

  const pending = day.tasks?.filter((task) => task.status === 'pending') ?? [];
  const next = pickNext(pending);
  const tint = useAccent(accentForFocus(next ? focusOf(next) : null, user?.accentColor ?? 'olive'));

  // Sin nada pendiente no hay "lo siguiente". El dia cerrado lo celebra la card de arriba; dos
  // mensajes de felicitacion apilados se leen como una plantilla, no como la app hablandote.
  if (!next) return null;

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Empezar: ${next.title}`}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => router.push('/timer')}
        style={[styles.card, shadow, { backgroundColor: t.surfaceAlt, borderColor: t.line }]}>
        <View style={styles.head}>
          <Micro>Lo que sigue</Micro>
          {!!next.dueAt && (
            <Text style={[Type.micro, { color: tint.ink }]}>{timeLabel(next.dueAt)}</Text>
          )}
        </View>

        <View style={styles.body}>
          <Icon3D name="lightning" size={Icon3DSize.lg} />
          <View style={styles.text}>
            <Text style={[Type.section, { color: t.text }]} numberOfLines={2}>
              {next.title}
            </Text>
            <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
              {next.suggestedMinutes} min · toca para enfocarte
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * La proxima: la que tiene hora mas cercana, y si ninguna tiene hora, la primera de la lista.
 *
 * Es la MISMA regla que `getToday` en el API. Vive escrita dos veces a proposito: alla la necesita
 * el widget, que no puede calcular nada, y aqui la pantalla ya tiene las tareas en la mano. Copiar
 * cuatro lineas cuesta menos que una peticion extra en cada apertura de la app.
 */
const pickNext = (pending: Task[]): Task | null =>
  pending.find((task) => task.dueAt) ?? pending[0] ?? null;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  text: { flex: 1, gap: Space.xs },
});
