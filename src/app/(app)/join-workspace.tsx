import { useLocalSearchParams } from 'expo-router';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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
import { codeFromLink } from '@/features/workspaces/invite-link';
import { CAN_SCAN } from '@/features/workspaces/can-scan';

import { useScreenPadding } from '@/hooks/use-screen-padding';
import { goBackOrHome } from '@/features/nav/go-back';

/** Se carga al tocar "Escanear", no al montar la pantalla. Ver el comentario de abajo. */
const QrScanner = lazy(() => import('@/features/workspaces/qr-scanner'));

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

  /**
   * El codigo puede llegar de tres sitios: tecleado, escaneado, o en el ENLACE que abrio la app.
   *
   * `?code=` es lo que hace que tocar la invitacion en WhatsApp caiga directo en la vista previa del
   * espacio en vez de en un campo vacio, que es justo la friccion que el enlace viene a quitar.
   */
  const link = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => codeFromLink(link.code ?? '') ?? '');
  /** Ya se comprobo el codigo del enlace. Sin esto el efecto lo reintentaria en cada render. */
  const asked = useRef(false);
  /** El escaner esta abierto. */
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  /** Se pidio entrar y falta que aprueben. Cambia lo que dice la confirmacion. */
  const [pending, setPending] = useState(false);

  /**
   * La salida vive en un efecto y no dentro de `join`: asi el timer se cancela con la pantalla y un
   * back manual durante la confirmacion no arrastra una navegacion huerfana.
   */
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(goBackOrHome, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const check = useCallback(async (typed: string) => {
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
  }, [token]);

  /** El del enlace se comprueba solo, una vez. Tocar la invitacion ya es la intencion. */
  useEffect(() => {
    if (asked.current || !code || code.length < 6 || !token) return;
    asked.current = true;
    void check(code);
  }, [code, token, check]);

  const join = async () => {
    if (!token || !found) return;
    setBusy(true);
    setError('');
    try {
      const { workspace, joined } = await invitesApi.join(token, code);
      /**
       * Con un codigo ABIERTO no se entra: queda una solicitud que el dueño aprueba. Activar el
       * espacio ahi seria mentir — la app lo pintaria como tuyo y el API no te dejaria ver nada.
       *
       * Con uno NOMINAL si se entra, y entonces se activa solo: volver al inicio y tener que
       * elegirlo a mano seria pedir dos veces lo mismo.
       */
      if (joined) await setActiveSpace({ ...workspace, tag: null });
      setPending(!joined);
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
              {/*
                Con un codigo abierto no entras: pides entrar. Decirlo AQUI y no en un toast es lo
                que evita que alguien cierre la pantalla creyendo que ya esta dentro y luego no
                encuentre el espacio en su lista.
              */}
              {pending && (
                <Text style={[Type.hint, styles.pending, { color: t.textMuted }]}>
                  Le avisé a quien lo administra. Entras en cuanto diga que sí.
                </Text>
              )}
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

              {/*
                Escanear es la via CORTA y por eso va debajo del campo y en ghost, no encima: quien
                llega aqui con el codigo ya tecleado no tiene que esquivar un boton de camara.

                Y solo si el binario trae la camara: un boton que abre una pantalla que revienta es
                peor que no tenerlo. Ver `CAN_SCAN`.
              */}
              {CAN_SCAN && (
                <BigButton
                  label="Escanear un código"
                  variant="ghost"
                  accent={accent}
                  onPress={() => setScanning(true)}
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        `lazy` y no un import normal: asi `expo-camera` no se evalua hasta que alguien toca escanear.
        Con el import arriba, montar esta pantalla en un binario sin la camara la tumbaba entera.
      */}
      {scanning && (
        <Suspense fallback={null}>
        <QrScanner
          onClose={() => setScanning(false)}
          onFound={(scanned) => {
            setScanning(false);
            setCode(scanned);
            void check(scanned);
          }}
        />
        </Suspense>
      )}
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
  pending: { textAlign: 'center' },
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
