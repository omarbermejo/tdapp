import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { BacklogList } from '@/features/tasks/backlog-list';
import { DayCard } from '@/features/tasks/day-card';
import { useLocalToday } from '@/features/tasks/day';
import { NextUp } from '@/features/tasks/next-up';
import { TodayList } from '@/features/tasks/today-list';
import { useBacklog, useTasks } from '@/features/tasks/use-tasks';
import { useScreenPadding } from '@/hooks/use-screen-padding';

import { TAB_DOCK } from './_layout';

/** Solo el nombre de pila: "Hola, Omar Bermejo Osuna" no es como te llama nadie. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * El titulo: el dia de la semana con mayuscula, en la serif.
 *
 * Se construye con numeros y no con `new Date(iso)`: parsear 'YYYY-MM-DD' lo trata como UTC y al
 * oeste de Greenwich devuelve el dia anterior.
 */
const weekday = (date: string) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** '31 de julio'. Debajo del titulo, en la voz de los controles. */
const longDate = (date: string) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
};

/**
 * HOY. No "el dia que estas viendo" — hoy.
 *
 * Aqui vivia una tira de la semana que cambiaba el dia de esta pantalla sin salir de ella, y con
 * ella esta pantalla y Planear eran la MISMA pantalla dos veces: las dos llamaban a `useTasks` con
 * un dia elegido y pintaban las mismas filas, y la unica diferencia era la tira de 7 dias contra la
 * de 14 y el riel de horas. Se fue la tira. Ahora **Hoy es ahora y Planear es cuando**, que es lo
 * que le da sentido a que sean dos pestañas — y es una decision menos en la pantalla que alguien
 * con TDAH abre veinte veces al dia.
 *
 * El orden de arriba a abajo es una frase: quien eres (el saludo), cuando estas (el dia), que se te
 * quedo atras (el backlog), como vas (la card), que sigue AHORA (la siguiente) y que falta (la
 * lista). El backlog va arriba de todo porque lo que se te paso es lo primero que hay que decidir.
 *
 * Anotar vive en la card y no flotando: la barra de abajo es solo para navegar.
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  const day = useTasks(today);
  const backlog = useBacklog(today);
  // El aire va en el CONTENIDO y no en un SafeAreaView: así el scroll pasa por debajo de la barra de
  // estado en vez de cortarse contra ella. Ver `use-screen-padding`.
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null, y salir antes
  // dejaba a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            Hola, {firstName(user.name)}
          </Text>
          {/* El unico sitio de la app con serif. Ver la nota de `Type` en constants/theme. */}
          <Text style={[Type.day, { color: t.text }]} numberOfLines={1}>
            {weekday(today)}
          </Text>
          <Text style={[Type.label, { color: t.textMuted }]} numberOfLines={1}>
            {longDate(today)}
          </Text>
        </View>

        <BacklogList backlog={backlog} />

        <DayCard day={day} today={today} selected={today} onCapture={() => router.push('/new-task')} />

        <NextUp day={day} />

        <TodayList day={day} today={today} selected={today} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    // El vertical lo pone `useScreenPadding`: depende de los insets del telefono, que no son estaticos.
    gap: Space.xl,
  },
  // El encabezado respira por dentro y no con el `gap` del scroll: las tres lineas son UNA cosa.
  head: { gap: Space.xs },
});
