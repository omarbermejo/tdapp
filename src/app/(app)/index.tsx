import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro, SectionHeader, Tag } from '@/components/ui/card';
import { Radius, Space, Touch, Type, useAccent, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS, REMINDER_HOUR, REMINDER_STYLE } from '@/features/auth/options';
import { NowCard } from '@/features/tasks/now-card';

type Options = readonly { value: string; label: string }[];

/** Por que importa: una cuenta de Google o Apple no tiene contraseña con la que entrar. */
const ENTRY: Record<string, string> = {
  password: 'Con tu correo y contraseña',
  google: 'Con tu cuenta de Google',
  apple: 'Con tu cuenta de Apple',
  oauth: 'Con un proveedor externo',
};

const labelOf = (options: Options, value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

const tagOf = (value: string) => labelOf(FOCUS_AREAS, value);

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const t = useTheme();
  const accent = useAccent(user.accentColor);
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Micro>{today.charAt(0).toUpperCase() + today.slice(1)}</Micro>
            <Text style={[Type.display, { color: t.text }]} numberOfLines={2}>
              Hola, {user.name}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: accent.soft }]}>
            <Text style={[Type.section, { color: t.text }]}>
              {user.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        {/*
          El héroe de la pantalla. Se fue de aquí la tarjeta de "tu mejor momento": competía por
          la atención con lo único que importa al abrir, y ese dato va a mover la barra de
          energía del día cuando exista, que es donde de verdad sirve.
        */}
        <NowCard />

        <View style={styles.block}>
          <SectionHeader title="Tu perfil" hint="Lo que nos contaste al empezar." />

          <Card>
            <View style={styles.row}>
              <Micro>Recordatorios</Micro>
              <Text style={[Type.body, styles.value, { color: t.text }]}>
                {`${labelOf(REMINDER_STYLE, user.reminderStyle)}, a las ${labelOf(
                  REMINDER_HOUR,
                  String(user.reminderHour)
                )}`}
              </Text>
            </View>
            {!!user.birthDate && (
              <View style={styles.row}>
                <Micro>Naciste</Micro>
                <Text style={[Type.body, styles.value, { color: t.text }]}>
                  {new Date(`${user.birthDate}T00:00:00`).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
            )}
          </Card>

          <Card>
            <Micro>Focos</Micro>
            {user.focusAreas.length ? (
              <View style={styles.tags}>
                {user.focusAreas.map((f) => (
                  <Tag key={f} label={tagOf(f)} />
                ))}
              </View>
            ) : (
              <Text style={[Type.body, { color: t.textMuted }]}>Sin definir</Text>
            )}
          </Card>
        </View>

        <View style={[styles.email, { borderTopColor: t.line }]}>
          <Micro>Cómo entras</Micro>
          <Text style={[Type.body, styles.value, { color: t.text }]}>{user.email}</Text>
          <Text style={[Type.hint, { color: t.textMuted }]}>{ENTRY[user.authProvider ?? 'password']}</Text>
        </View>

        <BigButton label="Cerrar sesión" variant="ghost" accent="copper" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.huge,
    gap: Space.xl,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  headText: { flex: 1, gap: Space.xs },
  avatar: {
    width: Touch.chip,
    height: Touch.chip,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { gap: Space.md },
  row: { gap: Space.xs },
  value: { fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  email: {
    gap: Space.xs,
    borderTopWidth: 1,
    paddingTop: Space.lg,
  },
});
