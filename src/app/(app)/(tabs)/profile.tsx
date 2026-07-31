import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro, SectionHeader, Tag } from '@/components/ui/card';
import { Radius, Space, Touch, Type, useAccent, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS, REMINDER_HOUR, REMINDER_STYLE } from '@/features/auth/options';

import { useScreenPadding } from '@/hooks/use-screen-padding';

import { TAB_DOCK } from './_layout';

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

/** Lo que no cambia hoy: quien eres, como te recordamos y como entras. */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const t = useTheme();
  const accent = useAccent(user?.accentColor);
  // El aire va en el contenido, no en un SafeAreaView: ver `use-screen-padding`.
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: accent.soft }]}>
            <Text style={[Type.section, { color: t.text }]}>
              {user.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[Type.display, styles.name, { color: t.text }]} numberOfLines={2}>
            {user.name}
          </Text>
        </View>

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
                  <Tag key={f} label={tagOf(f)} accent={user.accentColor} />
                ))}
              </View>
            ) : (
              <Text style={[Type.body, { color: t.textMuted }]}>Sin definir</Text>
            )}
          </Card>
        </View>

        <View style={styles.block}>
          <SectionHeader title="Cómo entras" />

          <Card>
            <View style={styles.row}>
              <Text style={[Type.body, styles.value, { color: t.text }]}>{user.email}</Text>
              <Text style={[Type.hint, { color: t.textMuted }]}>
                {ENTRY[user.authProvider ?? 'password']}
              </Text>
            </View>
          </Card>
        </View>

        <BigButton label="Cerrar sesión" variant="ghost" accent="copper" onPress={signOut} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    // El vertical lo pone `useScreenPadding`: sale de los insets del telefono.
    gap: Space.xl,
  },
  head: { gap: Space.md },
  avatar: {
    width: Touch.chip,
    height: Touch.chip,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { paddingRight: Space.xl },
  block: { gap: Space.md },
  row: { gap: Space.xs },
  value: { fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
});
