import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { FormError } from '@/components/ui/form-error';
import { Motion, Space, Type, useTheme } from '@/constants/theme';
import { ApiError, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Borrar la cuenta, desde dentro de la tarjeta "Tu cuenta".
 *
 * Vive en su propio archivo por la misma razón que `profile-fields`: la maquinaria de un panel no
 * pertenece a la pantalla, que es una lista de tarjetas. Y va dentro de esa tarjeta y no suelto al
 * final, porque hasta hoy era la única puramente informativa — el correo y "Con tu correo y
 * contraseña" describen la cuenta, y esta es la única acción que existe sobre ella.
 *
 * **Panel Y Alert, los dos.** El panel es donde se teclea: `Alert.prompt` es solo de iOS, así que un
 * Alert no puede pedir la contraseña. El Alert es el último "de verdad" antes de un borrado que
 * nadie puede deshacer, y sigue el molde de `task-row.tsx` incluido el verbo concreto en la
 * cancelación. En una cuenta de Google el Alert es la única fricción, y es la correcta: `authProvider`
 * ya nos dice que no hay contraseña que pedir, y arrastrar el SDK del proveedor hasta el perfil para
 * re-autenticar sería desproporcionado.
 */
export function DeleteAccount({ user }: { user: User }) {
  const t = useTheme();
  const { deleteAccount } = useAuth();

  /** Cerrado al entrar: esta tarjeta es para leer el correo, no para borrarse. */
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  /** Una cuenta de Google o Apple no tiene contraseña que teclear. */
  const needsPassword = (user.authProvider ?? 'password') === 'password';

  const remove = async () => {
    setProblem('');
    setBusy(true);
    try {
      await deleteAccount(needsPassword ? password : undefined);
      // Nada que limpiar en el camino feliz: al quedarse sin sesión el guard desmonta esto.
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'No pudimos borrarla. Inténtalo otra vez.');
      setBusy(false);
    }
  };

  const confirm = () => {
    // El botón nunca se apaga: explica en vez de bloquear. Misma regla que `profile-fields`.
    if (needsPassword && !password) return setProblem('Escribe tu contraseña para confirmar.');

    Alert.alert('¿Borrar tu cuenta?', 'Se va todo y no vuelve.', [
      { text: 'Dejarla', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: remove },
    ]);
  };

  return (
    <>
      <BigButton
        label="Borrar mi cuenta"
        variant="ghost"
        accent="copper"
        onPress={() => {
          setProblem('');
          setPassword('');
          setOpen(!open);
        }}
      />

      {/* Solo entrada, igual que los paneles de `profile-fields`: sin el reacomodo de la Card, una
          salida animada quedaria dibujada fuera de ella. Ver el docstring de `IN` alli. */}
      {open && (
        <Animated.View
          entering={FadeInDown.duration(Motion.enter)}
          style={styles.panel}>
          <Text style={[Type.hint, { color: t.textMuted }]}>
            Se van tus tareas, tu racha y lo que sé de ti. No hay forma de recuperarlo.
          </Text>

          {needsPassword && (
            <BigField
              label="Tu contraseña"
              placeholder="La de siempre"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (problem) setProblem('');
              }}
              secureTextEntry
              autoComplete="current-password"
              autoCapitalize="none"
              accent="copper"
            />
          )}

          {/* El único botón sólido de la pantalla, y solo cuando de verdad hay algo que confirmar. */}
          <BigButton label="Borrar mi cuenta" accent="copper" loading={busy} onPress={confirm} />
          <FormError message={problem} />
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Space.lg },
});
