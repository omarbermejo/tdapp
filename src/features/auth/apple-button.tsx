import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Radius, Theme, Touch, Type } from '@/constants/theme';

import { ApiError } from './api';
import { useAuth } from './auth-context';

/**
 * Sign in with Apple. Solo se pinta donde el sistema lo soporta (iPhone con iOS 13+):
 * en Android isAvailableAsync devuelve false y en web hay un stub que no renderiza nada.
 *
 * Usamos el boton nativo de Apple porque sus lineamientos exigen ese diseño; lo unico
 * que ajustamos es el radio y la altura para que case con el resto de la pila.
 */
export function AppleButton() {
  const { signInWithApple } = useAuth();
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const signIn = async () => {
    setError('');
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
    }
  };

  return (
    <>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
        cornerRadius={Radius.md}
        style={styles.button}
        onPress={signIn}
      />
      {!!error && <Text style={[Type.hint, styles.error]}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: '100%', height: Touch.button },
  error: { color: Theme.danger },
});
