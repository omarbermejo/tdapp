import * as AppleAuthentication from 'expo-apple-authentication';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormError } from '@/components/ui/form-error';
import { BigButton } from '@/components/ui/big-button';
import { useTheme } from '@/constants/theme';

import { ApiError } from './api';
import { useAuth } from './auth-context';

/**
 * Sign in with Apple. Solo se pinta donde el sistema lo soporta (iPhone con iOS 13+):
 * en Android isAvailableAsync devuelve false y en web hay un stub que no renderiza nada.
 *
 * Usamos BigButton y no AppleAuthenticationButton: el nativo dibuja su etiqueta a 20.7pt
 * contra los 17pt del resto y no deja cambiarla, asi que la pila se veia despareja aunque
 * las cajas midieran igual. Los lineamientos de Apple permiten un boton propio mientras
 * lleve su logo, un texto aprobado y contraste suficiente; esto cumple las tres.
 */
export function AppleButton() {
  const t = useTheme();
  const { signInWithApple } = useAuth();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const signIn = async () => {
    setError('');
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new ApiError('Apple no devolvió el token de identidad');

      // Apple manda el nombre solo en la primera autorizacion: si viene, se lo pasamos a la API.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ');

      await signInWithApple(credential.identityToken, name || undefined);
    } catch (e) {
      // El usuario cerro la hoja de Apple: no es un error que valga la pena mostrar.
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError(e instanceof ApiError ? e.message : 'No se pudo entrar con Apple');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BigButton
        label="Continuar con Apple"
        variant="outline"
        loading={loading}
        onPress={signIn}
        icon={<SymbolView name="apple.logo" tintColor={t.text} style={styles.logo} />}
      />
      <FormError message={error} />
    </>
  );
}

const styles = StyleSheet.create({
  // Mismo alto que el logo de Google; el de Apple es mas angosto por su propia forma.
  logo: { width: 18, height: 20 },
});
