import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Icon3D, Icon3DSize } from '@/components/ui/icon3d';
import { Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { ActivityEvent, EventKind } from '@/features/auth/api';

/**
 * Como se cuenta cada clase de novedad.
 *
 * En SEGUNDA persona y en pasado — "Cerraste", "Moviste" — porque hoy el actor eres siempre tu. El
 * dia que un espacio compartido traiga eventos de otra gente, la fila antepone su nombre y el verbo
 * pasa a tercera persona; por eso el texto vive aqui y no incrustado en el JSX.
 */
const VERB: Record<EventKind, string> = {
  created: 'Anotaste',
  completed: 'Cerraste',
  reopened: 'Reabriste',
  moved: 'Moviste',
  edited: 'Cambiaste',
  deleted: 'Borraste',
};

/** El icono 3D de cada clase. Sale del set que ya existe: ningun archivo nuevo. */
const ICON: Record<EventKind, Parameters<typeof Icon3D>[0]['name']> = {
  created: 'light',
  completed: 'check',
  reopened: 'clock',
  moved: 'home',
  edited: 'creativity',
  deleted: 'leaf',
};

/** Los nombres de campo, para que "Cambiaste el titulo" no diga "Cambiaste title". */
const FIELD: Record<string, string> = {
  title: 'el nombre',
  notes: 'las notas',
  size: 'el tamaño',
  minutes: 'la duración',
  focusArea: 'la clasificación',
  icon: 'el icono',
  dueAt: 'la fecha',
};

/**
 * La linea de abajo, la que dice QUE cambio exactamente.
 *
 * Devuelve '' cuando no hay nada util que añadir: una fila con dos lineas donde la segunda repite la
 * primera es peor que una fila de una linea.
 */
function detailOf(event: ActivityEvent): string {
  if (event.kind === 'edited') {
    const changed = (event.meta?.changed ?? []).map((f) => FIELD[f] ?? f);
    if (!changed.length) return '';
    if (changed.length === 1) return `Cambió ${changed[0]}.`;
    // Coma para todos menos el ultimo, que va con "y": leer "el nombre, la fecha" suena a lista rota.
    return `Cambió ${changed.slice(0, -1).join(', ')} y ${changed[changed.length - 1]}.`;
  }
  if (event.kind === 'moved') {
    // El espacio personal es `null`, y "Ahora está en tu espacio" es mas claro que su nombre propio.
    return event.meta?.to == null ? 'Volvió a tu espacio personal.' : 'Cambió de espacio.';
  }
  return '';
}

/**
 * Hace cuanto, en palabras.
 *
 * Se corta en los siete dias: mas alla, "hace 23 días" no dice nada que una fecha no diga mejor. El
 * `Date.parse` es seguro porque el servidor escribe ISO con Z a proposito — es justo la razon de que
 * `task_events.created_at` no use el `datetime('now')` del resto de la base.
 */
function agoOf(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;

  return new Date(then).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Una novedad.
 *
 * No es pulsable, y es una decision: `taskId` puede apuntar a una tarea que ya no existe — el evento
 * de borrado, sin ir mas lejos — asi que la mitad de las filas llevarian a un 404. Un boton que a
 * veces falla enseña a no tocar ninguno. Cuando haya pantalla de detalle de tarea, se abren solo las
 * que siguen vivas.
 */
export function EventRow({ event, accent }: { event: ActivityEvent; accent?: AccentName }) {
  const t = useTheme();
  const tint = useAccent(accent);
  const detail = detailOf(event);

  return (
    <View style={styles.row}>
      {/* El icono va sobre `sunken` y no sobre el acento: la lista entera teñida seria una alarma. */}
      <View style={[styles.badge, { backgroundColor: event.read ? t.sunken : tint.soft }]}>
        <Icon3D name={ICON[event.kind]} size={Icon3DSize.sm} />
      </View>

      <View style={styles.body}>
        <Text style={[Type.body, { color: t.text }]} numberOfLines={2}>
          <Text style={styles.verb}>{VERB[event.kind]} </Text>
          {event.taskTitle}
        </Text>
        {/* Detalle y hora en la misma linea: dos lineas de gris debajo pesan mas que la noticia. */}
        <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
          {detail ? `${detail} ` : ''}
          {agoOf(event.createdAt)}
        </Text>
      </View>
    </View>
  );
}

/** El estado vacio. Honesto: el feed empieza a contar desde ahora, no inventa historia. */
export function EmptyActivity() {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Image
        source={require('@/assets/stickers/bubble.svg')}
        style={styles.sticker}
        contentFit="contain"
        accessible={false}
      />
      <Text style={[Type.section, { color: t.text }]}>Nada que contar todavía.</Text>
      <Text style={[Type.body, { color: t.textMuted }]}>
        Aquí va apareciendo lo que pase con tus tareas: lo que anotas, lo que cierras y lo que
        cambias de sitio.
      </Text>
    </View>
  );
}

const BADGE = 40;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.sm },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  verb: { fontWeight: '700' },
  empty: { gap: Space.md, paddingVertical: Space.breath, alignItems: 'center' },
  sticker: { width: '48%', aspectRatio: 1 },
});
