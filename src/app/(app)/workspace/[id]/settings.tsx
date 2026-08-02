import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { ScreenGuard } from "@/components/ui/screen-guard";
import { ScreenHeader } from "@/components/ui/screen-header";
import { StatusVeil, useScrollVeil } from "@/components/ui/status-veil";
import { Space, Type, useTheme } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-context";
import { SpaceActions } from "@/features/workspaces/space-actions";
import { useWorkspace } from "@/features/workspaces/use-workspace";
import { useScreenPadding } from "@/hooks/use-screen-padding";

/**
 * Configurar un espacio: quién entra, cómo se ve, y borrarlo.
 *
 * **Estaba al final del detalle y se mudó aquí.** Con setenta tareas de por medio, el bloque quedaba
 * a veinte pantallazos de scroll: nadie iba a llegar. Y no era solo distancia — mezclaba "mirar cómo
 * va el proyecto" con "administrarlo", que son dos intenciones distintas y llegan en momentos
 * distintos. El engrane de la cabecera es la misma señal que el del perfil.
 *
 * Se llega solo si eres el dueño: el engrane no se pinta para un miembro. Aun así el guard vive
 * también dentro de `SpaceActions`, porque una ruta se puede abrir por enlace.
 */
export default function WorkspaceSettingsScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = Number(id);
  const space = useWorkspace(workspaceId);
  const veil = useScrollVeil();
  // `Space.breath` y no `TAB_DOCK`: fuera de las pestañas la capsula flotante no se pinta.
  const pad = useScreenPadding(Space.breath);

  // El guard va DESPUES de los hooks: al borrar el espacio, `space.workspace` se vuelve null con
  // esta pantalla todavia montada.
  if (!user) return <ScreenGuard />;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[
          styles.content,
          { paddingTop: pad.top, paddingBottom: pad.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader back title={space.workspace?.name ?? "El espacio"} />

        {space.missing ? (
          <Text style={[Type.body, { color: t.textMuted }]}>
            Este espacio ya no existe. Sus tareas siguen donde estaban.
          </Text>
        ) : (
          space.workspace && <SpaceActions workspace={space.workspace} />
        )}
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
});
