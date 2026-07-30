import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { TodayList } from '@/features/tasks/today-list';
import { useToday } from '@/features/tasks/use-today';
import { WeekStrip } from '@/features/tasks/week-strip';

import { TAB_DOCK } from './_layout';

/** Solo el nombre de pila: "Hola, Omar Bermejo Osuna" no es como te llama nadie. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * El dia, y nada mas.
 *
 * Aqui vivia una tarjeta "En curso" con el cronometro al frente. Se fue: contaba hacia ARRIBA
 * y pasarse de los 25 min se leia como una app rota, y encima le robaba la pantalla a lo unico
 * que el usuario viene a ver, que son sus tareas. En su lugar la semana, que responde "en que
 * dia estoy" sin pedir nada. El cronometro sigue vivo en el API (POST /tasks/:id/timer) para
 * cuando vuelva, y cuando vuelva cuenta hacia abajo.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const t = useTheme();
  // El dia vive aqui porque lo comparten el encabezado y la lista.
  const day = useToday();

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null, y salir antes
  // dejaba a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[Type.display, { color: t.text }]} numberOfLines={1}>
          Hola, {firstName(user.name)}
        </Text>

        {/* La tira ES la fecha de la pantalla: el home ya no imprime el dia en ninguna otra parte. */}
        <WeekStrip
          accent={user.accentColor}
          onPickDay={(date) => router.push(`/calendar?date=${date}`)}
        />

        <TodayList day={day} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    // El aire sale de la geometria de la barra flotante, que vive en `_layout`.
    paddingBottom: TAB_DOCK,
    gap: Space.xl,
  },
});
