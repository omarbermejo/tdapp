import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Micro } from '@/components/ui/card';
import { Radius, Space, Type, useShadow, useTheme } from '@/constants/theme';
import type { TaskCounts } from '@/features/auth/api';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Lo que has hecho y donde vive.
 *
 * Dos mitades y no dos filas: puestas una junto a otra se leen como un par — dos maneras de ordenar
 * lo mismo — y apiladas se leerian como dos secciones sin relacion.
 */
export function SummaryCards({ counts }: { counts: TaskCounts['counts'] | null }) {
  return (
    <View style={styles.row}>
      <TasksCard counts={counts} />
      <SpacesCard />
    </View>
  );
}

/**
 * Mis tareas.
 *
 * El numero es el de `/me/tasks/summary` y no el de `/me/stats`: ese ultimo mira 28 dias y solo
 * tareas con fecha, asi que encogeria con el tiempo. Un contador de perfil que baja no es un
 * contador.
 *
 * Lleva al calendario porque ahi es donde de verdad vive la lista completa; inventarle una pantalla
 * propia seria una tercera lista de tareas.
 */
function TasksCard({ counts }: { counts: TaskCounts['counts'] | null }) {
  const t = useTheme();
  const shadow = useShadow();
  const press = usePressScale({ to: 0.97 });

  return (
    <Animated.View style={[styles.half, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          counts
            ? `Mis tareas. ${counts.done} cerradas, ${counts.pending} pendientes.`
            : 'Mis tareas'
        }
        onPress={() => router.push('/calendar')}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, { backgroundColor: t.surface }, shadow]}>
        <Micro>Mis tareas</Micro>
        {/*
          Mientras no hay numero se deja el hueco vacio en vez de pintar un 0: un cero que luego se
          convierte en 128 se leyo como un dato, y era una mentira. Mismo criterio que la racha.
        */}
        <Text style={[Type.metric, { color: t.text }]}>{counts ? counts.done : ' '}</Text>
        <Text style={[Type.hint, { color: t.textMuted }]}>
          {counts
            ? counts.pending > 0
              ? `cerradas · ${counts.pending} por hacer`
              : 'cerradas'
            : 'Contando…'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Mis espacios.
 *
 * NO es pulsable, y eso es la decision: un boton que no lleva a ningun sitio miente. El borde
 * punteado usa el token `dashed`, que el sistema define literalmente como "el hueco por llenar", asi
 * que dice "esto viene" sin prometer un toque que no existe.
 */
function SpacesCard() {
  const t = useTheme();

  return (
    <View style={[styles.half, styles.card, styles.empty, { borderColor: t.dashed }]}>
      <Micro>Mis espacios</Micro>
      <Text style={[Type.body, { color: t.textMuted }]}>Pronto</Text>
      <Text style={[Type.hint, { color: t.textMuted }]}>Para separar el trabajo de lo tuyo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
  half: { flex: 1 },
  card: {
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.xs,
    // Las dos miden lo mismo aunque digan cosas de distinto largo: un par desparejo se lee como un
    // error de maquetado y no como una diferencia de contenido.
    minHeight: 132,
  },
  // Sin fondo y sin sombra: no es papel, es el sitio donde va a haber papel.
  empty: { borderWidth: 2, borderStyle: 'dashed', justifyContent: 'flex-start' },
});
