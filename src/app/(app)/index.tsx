import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { DayCard } from '@/features/tasks/day-card';
import { useLocalToday } from '@/features/tasks/day';
import { TodayList } from '@/features/tasks/today-list';
import { useTasks } from '@/features/tasks/use-tasks';
import { WeekStrip } from '@/features/tasks/week-strip';

import { TAB_DOCK } from './_layout';

/** Solo el nombre de pila: "Hola, Omar Bermejo Osuna" no es como te llama nadie. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * El dia, y nada mas.
 *
 * Aqui vivia una tarjeta "En curso" con el cronometro al frente. Se fue: contaba hacia ARRIBA
 * y pasarse de los 25 min se leia como una app rota, y encima le robaba la pantalla a lo unico
 * que el usuario viene a ver, que son sus tareas. El cronometro sigue vivo en el API
 * (POST /tasks/:id/timer) para cuando vuelva, y cuando vuelva cuenta hacia abajo.
 *
 * El orden de arriba a abajo es donde estoy (la semana), como voy (la card) y que falta (la
 * lista). Anotar vive en la card y no flotando: la barra de abajo es solo para navegar.
 *
 * Tocar un dia de la tira NO navega: cambia el dia de ESTA pantalla. El home dejo de ser "hoy"
 * para ser "el dia que estas viendo", asi que los datos ya no salen de /me/today (que solo sabe
 * de hoy) sino de /tasks?date=, y los conteos se cuentan aqui. La agenda sigue siendo otra
 * cosa: ahi se ve el riel de horas de dos semanas, aqui se ve UN dia y se trabaja en el.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  // '' significa "sin elegir", que es hoy: asi al cruzar la medianoche la pantalla se reancla sola.
  const [picked, setPicked] = useState('');
  const selected = picked || today;
  // El dia vive aqui porque lo comparten la tira, la card y la lista.
  const day = useTasks(selected);

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
          today={today}
          selected={selected}
          onPickDay={setPicked}
          accent={user.accentColor}
        />

        <DayCard
          day={day}
          today={today}
          selected={selected}
          onCapture={() => router.push('/new-task')}
        />

        <TodayList day={day} today={today} selected={selected} />
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
