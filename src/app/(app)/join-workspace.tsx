import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import { CodeField } from '@/components/ui/code-field';
import { FormError } from '@/components/ui/form-error';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Motion, Radius, Space, Type, useAccent, useTheme } from '@/constants/theme';
import { ApiError, type InvitePreview } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { invitesApi } from '@/features/workspaces/api';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/** Lo que la palomita se queda antes de irse. El mismo numero que `new-task` y `new-workspace`. */
const CONFIRM_MS = 700;

/**
 * Entrar a un espacio con un codigo de seis caracteres.
 *
 * Dos estados en UNA ruta, no dos pantallas: `typing` y `found`. El precedente es `onboarding.tsx`,
 * que lleva seis pasos en una sola ruta — y aqui, ademas, retroceder de la vista previa al codigo
 * tiene que conservar lo tecleado.
 *
 * La vista previa NO es un adorno: teclear seis caracteres y aparecer dentro de algo sin saber que es
 * no es una confirmacion, es un accidente. Y no consume la invitacion, asi que arrepentirse es gratis.
 */
export default function JoinWorkspaceScreen() {
  const { user, token, setActiveSpace } = useAuth();
  const t = useTheme();
  const accent = user?.accentColor;
  const [found, setFound] = useState<InvitePreview | null>(null);
  /**
   * El tinte del espacio encontrado, pedido ARRIBA con el resto de hooks.
   *
   * `useAccent` es un hook: dentro del JSX —y encima detras de un `found &&`— seria una llamada
   * condicional en medio del render. Acepta `undefined` y cae al acento por defecto, asi que se puede
   * pedir siempre aunque todavia no haya espacio.
   */
  const spaceTint = useAccent(found?.workspace.accent);
  // Arriba `Space.lg` pelado: la hoja ya nace por debajo de la barra de estado. Ver `new-task`.
  const pad = useScreenPadding(Space.xxl);

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  /**
   * La salida vive en un efecto y no dentro de `join`: asi el timer se cancela con la pantalla y un
   * back manual durante la confirmacion no arrastra una navegacion huerfana.
   */
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.back(), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const check = async (typed: string) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setFound(await invitesApi.check(token, typed));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos comprobar ese código');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!token || !found) return;
    setBusy(true);
    setError('');
    try {
      const { workspace } = await invitesApi.join(token, code);
      // Entrar a un espacio es ENTRAR: se activa solo. Volver al inicio y tener que elegirlo a mano
      // seria pedir dos veces lo mismo.
      await setActiveSpace({ ...workspace, tag: null });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos entrar');
      setBusy(false);
    }
  };

  // Despues de todos los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Space.lg, paddingBottom: pad.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BackButton close />

          <View style={styles.head}>
            <Micro>Unirse a un espacio</Micro>
          </View>

          {found ? (
            <Animated.View entering={FadeInDown.duration(Motion.enter)} style={styles.found}>
              {/* La misma pieza que la vista previa de crear: unirse y crear se reconocen como
                  la misma familia. */}
              <View style={[styles.chip, { backgroundColor: spaceTint.soft }]}>
                <Icon3D name={found.workspace.icon as Icon3DName} size={Icon3DSize.hero} />
              </View>

              <Text style={[Type.title, styles.center, { color: t.text }]}>{found.workspace.name}</Text>
              <Text style={[Type.body, styles.center, { color: t.textMuted }]}>
                {line(found)}
              </Text>

              <FormError message={error} />

              <BigButton
                label="Entrar"
                loading={busy}
                success={done}
                onPress={join}
                accent={found.workspace.accent}
              />
              <BigButton
                label="No es este"
                variant="ghost"
                onPress={() => {
                  setFound(null);
                  setError('');
                }}
              />
            </Animated.View>
          ) : (
            <>
              <Text style={[Type.title, { color: t.text }]}>¿Cuál es el código?</Text>
              <Text style={[Type.body, { color: t.textMuted }]}>
                Son seis caracteres. Te lo pasa quien te invitó.
              </Text>

              {/*
                Alfanumerico y en mayusculas: el codigo es base32, y el campo normaliza igual que el
                API — quien escribe "O" quiere decir cero.
              */}
              <CodeField
                length={6}
                type="alphanumeric"
                onType={setCode}
                onFilled={(value) => {
                  setCode(value);
                  void check(value);
                }}
                disabled={busy}
                error={!!error}
                accent={accent}
              />

              <FormError message={error} />

              {/* Por si el auto-envio no disparo (pegar, corregir el ultimo caracter). */}
              <BigButton
                label="Buscar el espacio"
                loading={busy}
                onPress={() => void check(code)}
                accent={accent}
                disabled={code.length < 6}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * La linea de debajo del nombre: quien te invito y cuanta gente hay. Nunca los nombres de los demas —
 * quien pregunta todavia no es miembro.
 */
const line = (found: InvitePreview) => {
  const quien = found.invitedBy ? `${found.invitedBy.name} te invitó.` : 'Te invitaron.';
  const cuantos = found.members === 1 ? 'Ahora mismo hay una persona.' : `Ahora mismo hay ${found.members}.`;
  return `${quien} ${cuantos}`;
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
  head: { gap: Space.xs },
  found: { gap: Space.md },
  chip: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
