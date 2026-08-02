import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AccentPicker } from '@/components/ui/accent-picker';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Card, Micro } from '@/components/ui/card';
import { Choice } from '@/components/ui/choice';
import { FormError } from '@/components/ui/form-error';
import { Pill } from '@/components/ui/pill';
import { Motion, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError, type Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ACCENT_COLOR, WORKSPACE_TAGS } from '@/features/auth/options';
import type { Icon3DName } from '@/components/ui/icon3d';

import { workspacesApi } from './api';
import { IconChoice } from './icon-choice';
import { InviteStep } from './invite-step';

/** Cuál de los cuatro campos está abierto. Uno a la vez, como en el perfil. */
type Panel = 'nombre' | 'cara' | 'clasificacion' | null;

/** Entra por donde sale la pastilla. Sin `exiting`: aquí NO vivimos dentro de una `Card` que encoja. */
const IN = FadeInDown.duration(Motion.enter);

const labelOf = (value?: string | null) =>
  WORKSPACE_TAGS.find((option) => option.value === value)?.label ?? 'Sin clasificar';

/** El nombre del acento, o 'Personalizado' si es un hex tecleado — ese no esta en el catalogo. */
const labelOfAccent = (value: string) =>
  ACCENT_COLOR.find((option) => option.value === value)?.label ?? 'Personalizado';

/**
 * Lo que se puede HACER con un espacio, y no solo mirar: invitar, corregirlo y borrarlo.
 *
 * La pantalla de detalle era de solo lectura — anillo, mapa y reparto — así que el código de
 * invitación solo existía durante los cuatro pasos de crearlo. Quien cerraba esa pantalla se quedaba
 * sin forma de invitar a nadie nunca más, y sin forma de corregir un nombre mal escrito.
 *
 * **Solo para quien lo administra.** `isOwner` lo manda el API en la lista y en el detalle; sin él
 * este bloque no se pinta entero. Un miembro ve el espacio y trabaja en él, pero no lo edita ni
 * reparte códigos.
 *
 * El idioma es el de `profile-fields`: una pastilla por campo, un panel abierto a la vez, y **sin
 * botón de guardar** — `workspacesApi.update` mergea por campo, así que la confirmación de cada
 * cambio es verlo puesto. Un "Guardar" al final pediría confirmar algo que ya está hecho.
 */
export function SpaceActions({ workspace }: { workspace: Workspace }) {
  const { token, setActiveSpace } = useAuth();
  const t = useTheme();
  const tint = useAccent(workspace.accent);

  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState(workspace.name);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  if (!workspace.isOwner) return null;

  const open = (which: Panel) => {
    setProblem('');
    // Al abrir, el borrador se reancla a lo guardado: un panel no arrastra un intento a medias.
    if (which === 'nombre') setName(workspace.name);
    setPanel(panel === which ? null : which);
  };

  /**
   * Guarda un campo. Optimista no: aquí el dato vive en el hook de la pantalla, no en un estado
   * local, así que lo que repinta es la recarga — y esa la dispara `andInvalidate` del cliente.
   */
  const save = async (patch: Parameters<typeof workspacesApi.update>[2]) => {
    if (!token) return;
    setProblem('');
    try {
      await workspacesApi.update(token, workspace.id, patch);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'No se guardó. Se quedó como estaba.');
    }
  };

  /**
   * Borrar pide confirmación en un `Alert` del sistema y no en un panel propio.
   *
   * Es la misma decisión que `delete-account` y por el mismo motivo: lo irreversible tiene que
   * romper el flujo de la pantalla, no vivir dentro de él. Y el texto dice lo que de verdad pasa —
   * las tareas SOBREVIVEN sueltas, que es justo lo que la gente teme al borrar un proyecto.
   */
  const remove = () => {
    Alert.alert(
      `¿Borrar "${workspace.name}"?`,
      'Sus tareas no se borran: se quedan sueltas en tu día. Lo que se va es el espacio.',
      [
        { text: 'Dejarlo', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            setBusy(true);
            try {
              await workspacesApi.remove(token, workspace.id);
              // Si era el activo, se vuelve al modo general antes de salir: navegar hacia atrás a un
              // inicio que todavía apunta a un espacio borrado pinta una pastilla fantasma.
              await setActiveSpace(null);
              router.back();
            } catch (e) {
              setProblem(e instanceof ApiError ? e.message : 'No se pudo borrar');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      {/*
        Invitar. El paso 4 de crear el espacio, ahora también aquí: es donde se vuelve cuando alguien
        más tiene que entrar, y es el mismo componente — no una segunda copia que se desincronice.
      */}
      <Card>
        <Micro>Quién entra</Micro>
        <InviteStep workspace={workspace} accent={workspace.accent} />
      </Card>

      <Card>
        <Micro>Cómo se ve</Micro>
        <Text style={[Type.hint, { color: t.textMuted }]}>Toca lo que quieras cambiar.</Text>

        <View style={styles.pills}>
          <Pill
            label="Nombre"
            value={workspace.name}
            active={panel === 'nombre'}
            accent={workspace.accent}
            bg="sunken"
            wide
            onPress={() => open('nombre')}
          />
          {/*
            El icono y el color van en UNA pastilla y no en dos.
            Separados, las dos quedaban con la etiqueta y el valor vacio debajo — un hueco que se lee
            como un dato que no cargo. Y ademas son la misma decision: es la CARA del espacio, lo que
            lo distingue de un vistazo en la rejilla del inicio. El punto de color es su valor.
          */}
          <Pill
            label="Cara y color"
            value={labelOfAccent(workspace.accent)}
            active={panel === 'cara'}
            accent={workspace.accent}
            bg="sunken"
            dot={tint.solid}
            onPress={() => open('cara')}
          />
          <Pill
            label="De qué va"
            value={labelOf(workspace.tag)}
            active={panel === 'clasificacion'}
            accent={workspace.accent}
            bg="sunken"
            wide
            onPress={() => open('clasificacion')}
          />
        </View>

        {panel === 'nombre' && (
          <Animated.View entering={IN} style={styles.panel}>
            <BigField
              label="Cómo se llama"
              value={name}
              onChangeText={setName}
              accent={workspace.accent}
              // Al soltar el teclado, no en cada tecla: un PATCH por pulsación sería una petición
              // por letra, y el API no tiene transacción para ordenarlas.
              onBlur={() => name.trim() && name.trim() !== workspace.name && void save({ name: name.trim() })}
            />
          </Animated.View>
        )}

        {panel === 'cara' && (
          <Animated.View entering={IN} style={styles.panel}>
            <IconChoice
              value={(workspace.icon ?? 'work') as Icon3DName}
              onChange={(icon) => void save({ icon })}
              accent={workspace.accent}
            />
            <AccentPicker
              value={workspace.accent}
              onChange={(accent: AccentName) => void save({ accent })}
            />
          </Animated.View>
        )}

        {panel === 'clasificacion' && (
          <Animated.View entering={IN} style={styles.panel}>
            <Text style={[Type.hint, { color: t.textMuted }]}>
              De aquí salen el icono y el color de sus tareas cuando no tienen foco propio.
            </Text>
            <Choice
              options={WORKSPACE_TAGS}
              value={workspace.tag ?? ''}
              onChange={(tag) => void save({ tag })}
              accent={workspace.accent}
            />
          </Animated.View>
        )}

        <FormError message={problem} />
      </Card>

      {/* La salida, sola y al final. Ghost en cobre, igual que las otras dos de la app. */}
      <BigButton label="Borrar este espacio" variant="ghost" accent="copper" loading={busy} onPress={remove} />
    </>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  panel: { gap: Space.md },
});
