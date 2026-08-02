import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import { SchemeToggle } from '@/components/ui/scheme-toggle';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { DeleteAccount } from '@/features/profile/delete-account';
import { ProfileFields } from '@/features/profile/profile-fields';
import { OwnedSpaces } from '@/features/workspaces/owned-spaces';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/** Por que importa: una cuenta de Google o Apple no tiene contraseña con la que entrar. */
const ENTRY: Record<string, string> = {
  password: 'Con tu correo y contraseña',
  google: 'Con tu cuenta de Google',
  apple: 'Con tu cuenta de Apple',
  oauth: 'Con un proveedor externo',
};

/**
 * Ajustes: cómo funciona la app contigo.
 *
 * Cinco bloques y este orden, que no es alfabético ni casual: primero lo único que cambia cómo se
 * comporta la app MAÑANA (lo que sé de ti), después lo del aparato, luego la cuenta como dato de
 * solo lectura, luego lo administrativo, y al final las dos formas de irse.
 *
 * **La regla que evita el muro de tarjetas**: `Card` solo donde hay un grupo de cosas que TOCAR;
 * `Micro` + contenido suelto donde solo hay algo que LEER. Con eso quedan DOS tarjetas y no cuatro,
 * y el ritmo pasa a papel · aire · aire · papel · aire. Antes cada sección era papel y la pantalla
 * se leía como una lista de cajas iguales sin jerarquía.
 *
 * **Las dos salidas van juntas.** "Borrar mi cuenta" estaba escondido dentro de la tarjeta de la
 * cuenta y "Cerrar sesión" flotaba suelto al fondo: dos maneras de irse en dos sitios distintos, y
 * la irreversible era la que estaba a mano. Bajo un solo rótulo se leen como lo que son, con la
 * reversible primero. Y sacar el borrado de ahí deja la tarjeta de la cuenta siendo lo que dice
 * ser: un dato.
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
      {/*
        El KAV es por el campo de contraseña de `DeleteAccount`, que vive en el ultimo bloque del
        scroll. Envuelve solo al scroll; el velo se queda fuera. Ver el mismo patron y el mismo
        argumento en `edit-profile`.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}>
        <Animated.ScrollView
          {...veil.scrollProps}
          contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <ScreenHeader back title="Ajustes" />

          {/*
            Primero porque es lo unico de esta pantalla que cambia lo que la app HACE: la hora del
            aviso, la franja en la que rindes, los focos que ordenan el dia. Todo lo demas de aqui es
            del aparato o de la cuenta.
          */}
          <ProfileFields user={user} />

          {/*
            Suelto y no en tarjeta: es UNA fila con un control. El tema lleva etiqueta —a diferencia
            de cuando el interruptor vivia junto a la cara, donde su confirmacion era que la pantalla
            entera cambiaba de color— porque en una lista de ajustes un circulo sin nombre es un
            jeroglifico.
          */}
          <View style={styles.block}>
            <Micro>Cómo se ve</Micro>
            <View style={styles.row}>
              <View style={styles.label}>
                <Text style={[Type.body, { color: t.text }]}>Tema</Text>
                <Text style={[Type.hint, { color: t.textMuted }]}>
                  Sigue al sistema, o fíjalo en claro u oscuro.
                </Text>
              </View>
              <SchemeToggle />
            </View>
          </View>

          {/*
            Solo lectura, y por eso sin papel. El nombre, el correo y la contraseña siguen sin
            tocarse: `ProfileInput` no los incluye, y pintar un control que no puede guardar es peor
            que una etiqueta honesta. La contraseña se cambia desde la pantalla de entrar, con el
            codigo del correo.
          */}
          <View style={styles.block}>
            <Micro>Tu cuenta</Micro>
            <Text style={[Type.body, styles.email, { color: t.text }]}>{user.email}</Text>
            <Text style={[Type.hint, { color: t.textMuted }]}>
              {ENTRY[user.authProvider ?? 'password']}
            </Text>
          </View>

          {/*
            Los espacios que administras, para poder borrarlos. Se pinta sola o no se pinta: devuelve
            `null` si no eres dueño de ninguno.
          */}
          <OwnedSpaces />

          {/* Las dos salidas, tras una regla. La reversible primero. */}
          <View style={styles.block}>
            <View style={[styles.rule, { backgroundColor: t.line }]} />
            <Micro>Salir</Micro>
            <BigButton label="Cerrar sesión" variant="ghost" accent="copper" onPress={signOut} />
            <DeleteAccount user={user} />
          </View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
  /** Un bloque sin papel: el mismo aire interior que una `Card`, sin su fondo ni su sombra. */
  block: { gap: Space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  label: { flex: 1, gap: 2 },
  email: { fontWeight: '600' },
  /** Hairline por encima del rotulo: separa las salidas del resto sin gastar otra tarjeta. */
  rule: { height: StyleSheet.hairlineWidth, marginBottom: Space.md },
});
