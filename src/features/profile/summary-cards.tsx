import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Micro } from '@/components/ui/card';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Type, useShadow, useTheme } from '@/constants/theme';
import type { TaskCounts } from '@/features/auth/api';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
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
 * Decia "Pronto" detras de un borde punteado, con el argumento de que "un boton que no lleva a
 * ningun sitio miente". Ese argumento **ya no aplica**: `/spaces` existe, es la hoja "¿En que
 * estas?", y trae dentro crear un espacio y unirse con un codigo. Hay destino honesto para los tres
 * estados, asi que la mitad vuelve a ser papel — el par tiene que MEDIR y PESAR igual, y una mitad
 * de papel junto a una mitad de hueco ya no tiene razon de ser.
 *
 * `useWorkspaces` se monta aqui SIN coste de red: va por el cache y ya esta montado en cuatro sitios
 * mas, asi que esta es la quinta copia de la misma peticion, no una peticion mas.
 *
 * Los ICONOS y no los nombres. La identidad de un espacio es su glifo (ver `workspace-card`), y a
 * media fila cuatro nombres se elidirian a dos letras cada uno. El nombre viaja en el
 * `accessibilityLabel`, que es donde de verdad hace falta.
 */
function SpacesCard() {
  const t = useTheme();
  const shadow = useShadow();
  const press = usePressScale({ to: 0.97 });
  const { workspaces } = useWorkspaces();

  /** null = todavia no llego; [] = no tienes ninguno. Se dicen distinto a proposito. */
  const shown = workspaces?.slice(0, MAX_ICONS) ?? [];
  const extra = (workspaces?.length ?? 0) - shown.length;

  return (
    <Animated.View style={[styles.half, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          workspaces?.length
            ? `Mis espacios: ${workspaces.map((w) => w.name).join(', ')}`
            : 'Mis espacios'
        }
        onPress={() => router.push('/spaces')}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, { backgroundColor: t.surface }, shadow]}>
        <Micro>Mis espacios</Micro>
        {/* Mismo criterio que `TasksCard`: sin dato se deja el hueco, nunca un 0 que luego cambia. */}
        <Text style={[Type.metric, { color: t.text }]}>
          {workspaces?.length ? workspaces.length : ' '}
        </Text>

        {workspaces === null ? (
          <Text style={[Type.hint, { color: t.textMuted }]}>Contando…</Text>
        ) : workspaces.length === 0 ? (
          <Text style={[Type.hint, { color: t.textMuted }]}>
            Ninguno todavía · Toca para crear el primero
          </Text>
        ) : (
          <View style={styles.icons}>
            {shown.map((workspace) => (
              <Icon3D key={workspace.id} name={workspace.icon as Icon3DName} size={Icon3DSize.sm} />
            ))}
            {extra > 0 && <Text style={[Type.micro, { color: t.textMuted }]}>+{extra}</Text>}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Cuantos glifos caben en media fila sin apretarse. El resto se cuenta con un `+N`. */
const MAX_ICONS = 4;

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
  /** La fila de glifos ocupa el mismo renglon que la linea de apoyo de `TasksCard`. */
  icons: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
});
