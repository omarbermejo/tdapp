import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Motion, Space, Type, useTheme } from '@/constants/theme';
import type { Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { useActiveSpace } from '@/features/workspaces/active-space';
import { workspacesApi } from '@/features/workspaces/api';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';

/** La fila se va y las que quedan suben sin salto. La misma transicion que usa `Card`. */
const RESIZE = LinearTransition.duration(Motion.enter);

/** Cuantas tareas se quedan sueltas al borrarlo. Es lo que hay que decir antes de preguntar. */
const loose = (total: number) =>
  total === 0
    ? 'No tiene tareas.'
    : total === 1
      ? 'Su tarea no se borra: se queda suelta en tu día.'
      : `Sus ${total} tareas no se borran: se quedan sueltas en tu día.`;

/**
 * Los espacios que ADMINISTRAS, para poder borrarlos.
 *
 * Solo los tuyos, y eso no es una preferencia: la lista de espacios trae tambien aquellos a los que te
 * invitaron, y el API solo deja borrar los propios. Ofrecer la accion en uno ajeno contestaria 404
 * «Ese espacio no existe» sobre algo que se esta viendo en pantalla — el peor mensaje posible. Quien
 * decide es `workspace.isOwner`, que el API resuelve en la misma consulta que cuenta las tareas.
 *
 * Vive en Ajustes y no en el detalle del espacio a proposito: es la unica pantalla de la app donde ya
 * se borran cosas, y ya tiene el lenguaje montado — fantasma en cobre, panel que se abre, alerta con
 * la consecuencia en una frase.
 *
 * **Borrar un espacio NO borra su trabajo.** Las tareas sobreviven sueltas, con su dia intacto. Se
 * dice en el hint de cada fila porque es justo el miedo que frena a alguien a reorganizar sus cosas.
 */
export function OwnedSpaces() {
  const t = useTheme();
  const { token, setActiveSpace } = useAuth();
  const active = useActiveSpace();
  const { workspaces, drop, reload } = useWorkspaces();

  const mine = workspaces?.filter((w) => w.isOwner) ?? [];

  const remove = (workspace: Workspace) => {
    if (!token) return;
    // La fila se va en el mismo frame del toque: la alerta ya pregunto, aqui no hay nada mas que
    // confirmar. `drop` devuelve su deshacer, y a diferencia de una tarea aqui SI se puede usar —
    // reinserta por `position`, que es el mismo orden del API.
    const undo = drop(workspace);

    void (async () => {
      try {
        await workspacesApi.remove(token, workspace.id);
        /**
         * La base de datos se arregla sola —`active_workspace_id` es `ON DELETE SET NULL`— pero el
         * `user` que la app tiene en memoria NO: `me()` solo se llama al arrancar. Sin esto, el saludo
         * seguiria diciendo el nombre de un espacio borrado y las listas seguirian pidiendo su id.
         */
        if (active?.id === workspace.id) await setActiveSpace(null);
      } catch {
        undo();
        Alert.alert('No pudimos borrarlo', 'Inténtalo otra vez.');
        await reload();
      }
    })();
  };

  const confirm = (workspace: Workspace) =>
    // El mismo molde destructivo del repo: pregunta con la cosa nombrada, consecuencia en una frase,
    // y el boton de cancelar dice un verbo concreto ("Dejarlo") y nunca "Cancelar".
    Alert.alert(`¿Borrar "${workspace.name}"?`, loose(workspace.total), [
      { text: 'Dejarlo', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => remove(workspace) },
    ]);

  // `null` es "todavia no llego" y `[]` es "no eres dueño de ninguno". En los dos casos la tarjeta no
  // se pinta: una seccion vacia en Ajustes es mobiliario que informa de que no hay nada que hacer.
  if (!mine.length) return null;

  return (
    <Card>
      <Micro>Tus espacios</Micro>
      <Text style={[Type.hint, { color: t.textMuted }]}>
        Solo los que administras. Al borrarlos, sus tareas se quedan sueltas en tu día.
      </Text>

      {mine.map((workspace) => (
        <Animated.View key={workspace.id} layout={RESIZE} style={styles.row}>
          <Icon3D name={workspace.icon as Icon3DName} size={Icon3DSize.sm} />
          <View style={styles.label}>
            <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
              {workspace.name}
            </Text>
            <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
              {workspace.total === 1 ? '1 tarea' : `${workspace.total} tareas`}
            </Text>
          </View>
          {/*
            Fantasma y en cobre, como todo lo destructivo del repo: en reposo Ajustes no tiene ni un
            boton solido, y una lista con seis rellenos rojos convertiria una pantalla para leer en un
            campo de minas.
          */}
          <BigButton
            label="Borrar"
            variant="ghost"
            accent="copper"
            onPress={() => confirm(workspace)}
          />
        </Animated.View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  label: { flex: 1, gap: 2 },
});
