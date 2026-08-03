import * as Google from "expo-auth-session/providers/google";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "./api";
import { useAuth } from "./auth-context";

/**
 * OAuth de Google con los client IDs nativos (iOS/Android): el navegador del sistema
 * devuelve un id_token y la API lo canjea por nuestro JWT en POST /auth/google.
 *
 * Necesita development build: en Expo Go el esquema de redireccion es el de Expo, no el de la app.
 */
export function useGoogleSignIn() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handled = useRef<string>(undefined);

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId:
      "1063576011719-98a6i6dh0sgse9m6fu2bh3pc3lqm0o4j.apps.googleusercontent.com",
  });

  useEffect(() => {
    const idToken =
      response?.type === "success" ? response.params.id_token : undefined;
    // El id_token llega cuando el hook ya canjeo el code; el ref evita repetir el POST
    // cuando el contexto se re-renderiza con el usuario ya dentro.
    if (!idToken || handled.current === idToken) return;
    handled.current = idToken;

    setLoading(true);
    signInWithGoogle(idToken)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "No se pudo entrar con Google",
        ),
      )
      .finally(() => setLoading(false));
  }, [response, signInWithGoogle]);

  return {
    available: !!request,
    loading,
    error,
    signIn: () => {
      setError("");
      promptAsync();
    },
  };
}
