import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { SchemeToggle } from '@/components/ui/scheme-toggle';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { DeleteAccount } from '@/features/profile/delete-account';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/** Por que importa: una cuenta de Google o Apple no tiene contraseña con la que entrar. */
const ENTRY: Record<string, string> = {
  password: 'Con tu correo y contraseña',
  google: 'Con tu cuenta de Google',
  apple: 'Con tu cuenta de Apple',
  oauth: 'Con un proveedor externo',
};

/**
 * Ajustes: lo que es del aparato y lo que es de la cuenta.
 *
 * Todo esto vivia en el perfil y lo convertia en un panel de control. Aqui detras del engrane sigue
 * a un toque de distancia, pero deja de competir con lo unico que el perfil tiene que contar, que es
 * quien eres y cuanto llevas.
 *
 * En reposo no hay un solo boton solido: es una pantalla para leer. El unico `primary` aparece
 * dentro del panel de borrar, cuando de verdad hay algo que confirmar.
 */
export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const t = useTheme();
  const veil = useScrollVeil();
  // `Space.breath` y no `TAB_DOCK`: fuera de las pestañas la capsula flotante no se pinta, asi que
  // reservarle su hueco dejaria un vacio al final del scroll.
  const pad = useScreenPadding(Space.breath);

  // El guard va DESPUES de los hooks: al borrar la cuenta el user se vuelve null con esta pantalla
  // todavia montada, y salir antes dejaria a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader back title="Ajustes" />

        {/*
          El tema lleva etiqueta aqui y no la llevaba en el perfil. Alli el control estaba junto a la
          cara y su confirmacion era que la pantalla entera cambiaba de color; suelto en una lista de
          ajustes, un circulo sin nombre es un jeroglifico.
        */}
        <Card>
          <Micro>Apariencia</Micro>
          <View style={styles.row}>
            <View style={styles.label}>
              <Text style={[Type.body, { color: t.text }]}>Tema</Text>
              <Text style={[Type.hint, { color: t.textMuted }]}>
                Sigue al sistema, o fíjalo en claro u oscuro.
              </Text>
            </View>
            <SchemeToggle />
          </View>
        </Card>

        {/*
          El nombre, el correo y la contraseña siguen sin tocarse: `ProfileInput` no los incluye, y
          pintar un control que no puede guardar es peor que una etiqueta honesta. La contraseña se
          cambia desde la pantalla de entrar, con el codigo del correo.
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
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  label: { flex: 1, gap: 2 },
  email: { fontWeight: '600' },
});
