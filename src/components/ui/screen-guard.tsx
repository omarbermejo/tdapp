import { useTheme } from "@/constants/theme";
import { Booting } from "@/features/cache/booting";
import { View } from "react-native";

/**
 * Wrapper para pantallas protegidas que necesitan datos antes de renderizar.
 *
 * En lugar de retornar `null` cuando faltan datos (causando pantallas en blanco),
 * muestra un loading. Esto es especialmente importante durante:
 * - Transiciones rápidas entre rutas
 * - Cambios de sesión o contexto
 * - Revalidación de datos
 *
 * Uso:
 * ```tsx
 * if (!user) return <ScreenGuard loading />;
 * ```
 */
export function ScreenGuard({ loading = true }: { loading?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      {loading && <Booting slow={false} />}
    </View>
  );
}
