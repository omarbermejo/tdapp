import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { SchemeToggle } from '@/components/ui/scheme-toggle';
import { Radius, Space, Touch, Type, useAccent, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { DeleteAccount } from '@/features/profile/delete-account';
import { ProfileFields } from '@/features/profile/profile-fields';
import { StreakCard } from '@/features/streak/streak-card';
import { useStreak } from '@/features/streak/use-streak';
import { useLocalToday } from '@/features/tasks/day';
import { useScreenPadding } from '@/hooks/use-screen-padding';

import { TAB_DOCK } from './_layout';

/** Por que importa: una cuenta de Google o Apple no tiene contraseña con la que entrar. */
const ENTRY: Record<string, string> = {
  password: 'Con tu correo y contraseña',
  google: 'Con tu cuenta de Google',
  apple: 'Con tu cuenta de Apple',
  oauth: 'Con un proveedor externo',
};

/**
 * 'JULIO DE 2026' desde el `createdAt` del servidor.
 *
 * El `slice(0,10)` no es adorno: la columna es `datetime('now')`, o sea `'2026-07-30 12:34:56'` con un
 * espacio, y Hermes lo parsea como `Invalid Date`. Recortando la fecha y pegando la hora en ISO se
 * arregla, que es el mismo truco que ya usaba la fila de "Naciste".
 */
const sinceLabel = (createdAt: string) => {
  const at = new Date(`${createdAt.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at.getTime())) return '';
  return `Contigo desde ${at.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`;
};

/**
 * Tu perfil: un retrato con un solo dato vivo.
 *
 * Antes era una vitrina — nueve datos del mismo peso, ninguno tocable, y un encabezado que decía "Lo
 * que nos contaste al empezar" como si fuera piedra. Se veia igual el dia 1 que el dia 200, y la unica
 * accion de la pantalla era irse.
 *
 * Ahora manda la racha, que es lo unico de esta cuenta que cambia a diario y la unica razon para abrir
 * la pestaña dos veces; y los seis campos del onboarding viven debajo como pastillas que se corrigen
 * tocandolas. El API mergea por campo desde el primer dia (`PATCH /me/profile`), asi que la pantalla
 * por fin usa lo que ya existia.
 *
 * En reposo NO hay ningun boton solido: es una pantalla para leer. El unico `primary` aparece dentro de
 * un panel, cuando de verdad hay algo que confirmar.
 */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const t = useTheme();
  const accent = useAccent(user?.accentColor);
  const today = useLocalToday();
  const streak = useStreak(today);
  // El aire va en el contenido, no en un SafeAreaView: ver `use-screen-padding`.
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  const since = sinceLabel(user.createdAt);

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        {/*
          Identidad comprimida. El nombre baja de `display` a `section`: el `display` es la primera
          linea de una pantalla, y aqui la primera linea de verdad es la racha. Ademas el home ya
          saluda por el nombre todos los dias.
        */}
        <View style={styles.head}>
          <View style={[styles.avatar, { backgroundColor: accent.soft }]}>
            <Text style={[Type.section, { color: t.text }]}>
              {user.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.who}>
            <Text style={[Type.section, { color: t.text }]} numberOfLines={2}>
              {user.name}
            </Text>
            {/* `Micro` inline y no el componente: su docstring lo reserva para dentro de una tarjeta. */}
            {!!since && (
              <Text style={[Type.micro, { color: t.textMuted }]}>{since.toUpperCase()}</Text>
            )}
          </View>

          {/*
            El tema va AQUI y no como una pastilla más abajo: es lo único de esta pantalla que no
            describe a la persona sino al aparato, y su confirmación es que la pantalla entera cambia de
            color — no hace falta que diga su valor, porque el valor se ve.
          */}
          <SchemeToggle />
        </View>

        <StreakCard streak={streak} accent={user.accentColor} />

        <ProfileFields user={user} />

        {/*
          El nombre, el correo y la contraseña siguen sin tocarse desde aqui: `ProfileInput` no los
          incluye, y pintar un control que no puede guardar es peor que una etiqueta honesta. La
          contraseña se cambia desde la pantalla de entrar, con el codigo del correo.

          Lo que si vive aqui es borrarse. Esta tarjeta era la unica puramente informativa de la
          pantalla, y borrar la cuenta es la unica accion que existe sobre la cuenta.
        */}
        <Card>
          <Micro>Tu cuenta</Micro>
          <Text style={[Type.body, styles.email, { color: t.text }]}>{user.email}</Text>
          <Text style={[Type.hint, { color: t.textMuted }]}>
            {ENTRY[user.authProvider ?? 'password']}
          </Text>
          <DeleteAccount user={user} />
        </Card>

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
  // En fila y no apilado: el avatar deja de ser un adorno suelto y la cabecera ocupa la mitad de alto.
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  who: { flex: 1, gap: 2 },
  avatar: {
    width: Touch.chip,
    height: Touch.chip,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  email: { fontWeight: '600' },
});
