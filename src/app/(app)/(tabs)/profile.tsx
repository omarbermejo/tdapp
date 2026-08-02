import { router } from 'expo-router';
import Settings from 'lucide-react-native/icons/settings';
import UserPen from 'lucide-react-native/icons/user-pen';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar3DSize } from '@/components/ui/avatar3d';
import { HeaderAction, ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvatar } from '@/features/profile/avatar';
import { SummaryCards } from '@/features/profile/summary-cards';
import { HeatMap } from '@/features/stats/heat-map';
import { useStats } from '@/features/stats/use-stats';
import { useTaskCounts } from '@/features/stats/use-task-counts';
import { StreakCard } from '@/features/streak/streak-card';
import { useStreak } from '@/features/streak/use-streak';
import { useLocalToday } from '@/features/tasks/day';
import { useScreenPadding } from '@/hooks/use-screen-padding';

import { TAB_DOCK } from './_layout';

/**
 * 'CONTIGO DESDE JULIO DE 2026' desde el `createdAt` del servidor.
 *
 * El `slice(0,10)` no es adorno: la columna es `datetime('now')`, o sea `'2026-07-30 12:34:56'` con un
 * espacio, y Hermes lo parsea como `Invalid Date`. Recortando la fecha y pegando la hora en ISO se
 * arregla, que es el mismo truco que usa la fila de "Naciste".
 */
const sinceLabel = (createdAt: string) => {
  const at = new Date(`${createdAt.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at.getTime())) return '';
  return `Contigo desde ${at.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`;
};

/**
 * Tu perfil: quien eres y cuanto llevas.
 *
 * La cabecera va en DOS MITADES porque son dos preguntas distintas y ninguna manda sobre la otra: a
 * la izquierda quien eres — la cara y el nombre — y a la derecha cuanto has movido, en cuatro
 * semanas de celdas. Puestas una junto a otra se leen de un vistazo; apiladas, la de abajo se
 * convierte en un detalle.
 *
 * Lo que ya no vive aqui: la cuenta, el tema, cerrar sesion y borrarse estan en Ajustes (el engrane),
 * y "Como te ves" (el lapiz) lleva la cara y el color. Esta pantalla es un retrato, no un panel
 * de control — y antes era las dos cosas a la vez.
 */
export default function ProfileScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const veil = useScrollVeil();
  const today = useLocalToday();
  const streak = useStreak(today);
  const stats = useStats(today);
  const { counts } = useTaskCounts();
  // El aire va en el contenido, no en un SafeAreaView: ver `use-screen-padding`.
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de todos los hooks: al cerrar sesion el user se vuelve null y salir antes
  // dejaria a React con menos hooks que en el render anterior.
  if (!user) return null;

  const since = sinceLabel(user.createdAt);

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Perfil"
          actions={
            <>
              <HeaderAction
                icon={UserPen}
                label="Cómo te ves"
                onPress={() => router.push('/edit-profile')}
              />
              <HeaderAction
                icon={Settings}
                label="Ajustes"
                onPress={() => router.push('/settings')}
              />
            </>
          }
        />

        <View style={styles.identity}>
          <View style={styles.who}>
            <ProfileAvatar user={user} size={Avatar3DSize.hero} />
            <Text style={[Type.section, styles.name, { color: t.text }]} numberOfLines={2}>
              {user.name}
            </Text>
            {/* `Micro` inline y no el componente: su docstring lo reserva para dentro de una tarjeta. */}
            {!!since && (
              <Text style={[Type.micro, styles.since, { color: t.textMuted }]}>
                {since.toUpperCase()}
              </Text>
            )}
          </View>

          <View style={styles.map}>
            <Micro>Últimas 4 semanas</Micro>
            <HeatMap stats={stats} today={today} accent={user.accentColor} />
          </View>
        </View>

        {/*
          La racha se queda aunque el mapa mida lo mismo: no dicen lo mismo. El mapa dice DENSIDAD —
          cuanto has movido — y la racha dice CONTINUIDAD, que es lo unico de esta cuenta que se
          puede perder por dejar pasar un dia.
        */}
        <StreakCard streak={streak} accent={user.accentColor} />

        <SummaryCards counts={counts} />
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

/** `Micro` local: el de `card.tsx` está reservado a lo que va dentro de una tarjeta. */
function Micro({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[Type.micro, { color: t.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    // El vertical lo pone `useScreenPadding`: sale de los insets del telefono.
    gap: Space.xl,
  },
  identity: { flexDirection: 'row', gap: Space.lg, alignItems: 'center' },
  // Las dos mitades miden igual: la cara no se come el mapa ni al reves.
  who: { flex: 1, alignItems: 'center', gap: Space.sm },
  map: { flex: 1, gap: Space.sm },
  name: { textAlign: 'center' },
  since: { textAlign: 'center' },
});
