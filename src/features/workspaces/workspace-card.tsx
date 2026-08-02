import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Radius, Space, Type, useAccent, useShadow, useTheme } from '@/constants/theme';
import type { Workspace } from '@/features/auth/api';
import { usePressScale } from '@/hooks/use-press-scale';

/** Cuantas tareas tiene, con el singular resuelto. El numero no se repite en los chips. */
const tasksLine = (total: number) => (total === 1 ? '1 tarea' : `${total} tareas`);

/**
 * Los chips de abajo. Espacio cerrado dice UNA cosa y no dos: "3 hechas · 0 faltan" convierte un
 * espacio terminado en una resta.
 *
 * El verbo es el de `day-card` ("Faltan 3"), no "pendientes": la app cuenta lo que queda, no lo que
 * esta mal.
 */
const chipsOf = (total: number, done: number): string[] => {
  if (total === 0) return [];
  if (done === total) return ['Todo hecho'];
  if (done === 0) return [`${total} por empezar`];
  return [`${done} hechas`, `${total - done} faltan`];
};

/**
 * Un espacio de trabajo, como card. Dos por fila.
 *
 * El icono 3D va a `Icon3DSize.md` (32) y no a `lg` (44): 32 es el piso documentado donde un render 3D
 * todavia se lee como objeto, y en media fila un 44 junto a un anillo de 44 deja el nombre en dos
 * lineas. El anillo si mide 44, que es `Touch.icon` — se lee como objeto y no como adorno.
 *
 * Card propia y no `Card` del sistema: esa trae `padding: Space.xl` (24) y `gap: Space.md`, que en
 * 157pt de ancho deja 109 utiles para un anillo de 44 y un icono de 32. Aqui el aire es `Space.lg`.
 */
export function WorkspaceCard({
  workspace,
  onActivate,
}: {
  workspace: Workspace;
  /**
   * Tocar la card ENTRA al espacio, no navega a su detalle.
   *
   * Es la decision que evita tener dos formas de "estar en un espacio": el detalle sigue existiendo
   * como pantalla para mirar uno sin salir del que estas, pero la card es la puerta de entrada.
   */
  onActivate: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(workspace.accent);
  const shadow = useShadow();
  const press = usePressScale({ to: 0.97 });
  const { total, done } = workspace;

  return (
    <Animated.View style={[styles.slot, press.style]}>
      {/*
        La card ENTERA abre el espacio, que es lo que cualquiera intenta primero — y con su sombra ya se
        lee como un objeto que se puede tomar.

        Un solo nodo accesible con rol de boton y no `progressbar`: el progreso viaja en el `value`, asi
        que un lector de pantalla anuncia "Tesis, 25 tareas, 18 de 25" y ademas que se puede abrir. Como
        progressbar seria un dato que no se puede tocar.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${workspace.name}. ${tasksLine(total)}`}
        accessibilityValue={{ min: 0, max: total, now: done }}
        accessibilityHint="Trabaja en este espacio"
        onPress={onActivate}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, { backgroundColor: t.surface }, shadow]}>
        <View style={styles.head}>
          <ProgressRing done={done} total={total} accent={workspace.accent} />
          {/* El icono es la identidad del espacio: se reconoce por forma antes de leer el nombre. */}
          <Icon3D name={workspace.icon as Icon3DName} size={Icon3DSize.md} />
        </View>

        <View style={styles.body}>
          <Text style={[Type.section, { color: t.text }]} numberOfLines={1}>
            {workspace.name}
          </Text>
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            {total === 0 ? 'Sin tareas todavía' : tasksLine(total)}
          </Text>
        </View>

        {/* Chips propios y no `Tag`: ese es `alignSelf: 'flex-start'` y aqui van dos en fila. */}
        {chipsOf(total, done).length > 0 && (
          <View style={styles.chips}>
            {chipsOf(total, done).map((label) => (
              <View key={label} style={[styles.chip, { backgroundColor: tint.soft }]}>
                <Text style={[Type.micro, styles.chipLabel, { color: t.text }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /**
   * `flexBasis: '46%'` y no `'50%'`: con el `gap` de la rejilla, dos al 50% no caben y la segunda baja
   * de fila. 46 deja aire para el hueco y `flexGrow` reparte el sobrante, asi que un espacio impar
   * ocupa la fila entera — que se lee como intencion, igual que en `choice.tsx`.
   */
  slot: { flexGrow: 1, flexBasis: '46%' },
  // El hundido del toque vive en el `slot` de fuera y el relleno aqui: `press.style` escribe
  // `transform`, y en un array de estilos la ultima clave gana.
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Space.lg,
    gap: Space.md,
  },
  // El anillo a la izquierda y el icono a la derecha: el dato primero, la identidad despues.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { gap: Space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
  },
  chipLabel: { letterSpacing: 0 },
});
