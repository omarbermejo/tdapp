import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { OtpInput, type OtpInputRef } from 'react-native-otp-entry';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { StepDots } from '@/components/ui/step-dots';
import { Accents, Radius, Shadow, Space, Theme, Touch, Type } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

const DIGITS = 6;

/**
 * Codigo de verificacion. No hay boton oscuro a proposito: `onFilled` verifica solo, asi que
 * un "Confirmar" estaria apagado el 95% del tiempo. Las celdas SON el CTA.
 *
 * Tampoco hay boton de volver: el grupo de rutas cambio y no hay historial. La salida para
 * quien escribio mal su correo es "Usar otro correo", que cierra sesion — y el API deja
 * reclamar un correo sin verificar registrandose otra vez.
 */
export default function VerifyScreen() {
  const { user, verify, resend, signOut } = useAuth();
  const input = useRef<OtpInputRef>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'sent'>('idle');
  const [error, setError] = useState('');

  const tint = Accents.olive.ink;

  const submit = async (code: string) => {
    setError('');
    setState('checking');
    try {
      await verify(code);
    } catch (e) {
      const message =
        e instanceof ApiError ? (e.fields.code ?? e.message) : 'No pudimos comprobar el código';
      setError(message);
      setState('idle');
      input.current?.clear();
      input.current?.focus();
    }
  };

  const askAgain = async () => {
    setError('');
    try {
      await resend();
      setState('sent');
      input.current?.clear();
      input.current?.focus();
    } catch (e) {
      // El API sabe cuanto falta para el siguiente envio: su mensaje es mas exacto que un
      // contador nuestro. ponytail: la cuenta regresiva se agrega si alguien se queja.
      setError(e instanceof ApiError ? e.message : 'No pudimos reenviar el código');
    }
  };

  const status = error
    ? error
    : state === 'checking'
      ? 'Comprobando…'
      : state === 'sent'
        ? 'Va otro código en camino.'
        : 'Escribe los 6 dígitos que te llegaron.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <StepDots total={2} current={1} />
      </View>

      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={[Type.display, styles.title]}>Revisa tu correo.</Text>
          <Text style={[Type.display, styles.titleAccent]}>Ahí está tu código.</Text>
          <Text style={[Type.body, styles.subtitle]}>Seis dígitos. Vencen en 10 minutos.</Text>
          <Text style={[Type.label, styles.email]}>{user?.email}</Text>
        </View>

        <OtpInput
          ref={input}
          numberOfDigits={DIGITS}
          type="numeric"
          autoFocus
          blurOnFilled
          focusColor={tint}
          disabled={state === 'checking'}
          onTextChange={() => error && setError('')}
          onFilled={submit}
          // No pasar autoComplete aqui: la libreria ya pone oneTimeCode / sms-otp y esto
          // se hace spread despues, asi que los pisaria.
          textInputProps={{ accessibilityLabel: 'Código de 6 dígitos', autoCorrect: false }}
          theme={{
            containerStyle: styles.cells,
            pinCodeContainerStyle: { ...styles.cell, ...(error && styles.cellError) },
            filledPinCodeContainerStyle: styles.cellFilled,
            focusedPinCodeContainerStyle: styles.cellFocused,
            disabledPinCodeContainerStyle: styles.cellDisabled,
            pinCodeTextStyle: styles.digit,
            focusStickStyle: { ...styles.stick, backgroundColor: tint },
          }}
        />

        <Text
          accessibilityLiveRegion="polite"
          style={[Type.hint, styles.status, !!error && styles.statusError]}>
          {status}
        </Text>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          <BigButton label="Reenviar código" variant="outline" onPress={askAgain} />
          <BigButton label="Usar otro correo" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.canvas },
  header: { paddingHorizontal: Space.xl, paddingVertical: Space.md },
  content: {
    flex: 1,
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  hero: { gap: Space.sm },
  title: { color: Theme.text },
  titleAccent: { color: Accents.olive.ink },
  subtitle: { color: Theme.textMuted },
  email: { color: Theme.text },

  cells: { gap: Space.sm },
  cell: {
    // flex gana sobre el width: 44 de la libreria, asi las 6 celdas reparten el ancho
    // desde un iPhone SE hasta un Max sin numeros magicos.
    flex: 1,
    height: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    // El borde vacio ES la instruccion ("hay seis huecos"), asi que va en muted, no en line.
    borderColor: Theme.textMuted,
    backgroundColor: Theme.surface,
  },
  cellError: { borderColor: Theme.danger, borderWidth: 1.5 },
  cellFilled: { borderColor: Theme.text },
  cellFocused: { borderWidth: 1.5, ...Shadow.card },
  cellDisabled: { backgroundColor: Theme.sunken, borderColor: Theme.line },
  // letterSpacing 0 pisa el tracking negativo de metric: en un glifo solo lo descuadra.
  digit: { ...Type.metric, color: Theme.text, letterSpacing: 0 },
  stick: { width: 2, height: 24, borderRadius: Radius.pill },

  // Alto fijo para dos lineas: el mensaje cambia sin mover las celdas ni los botones.
  status: { color: Theme.textMuted, minHeight: 40 },
  statusError: { color: Theme.danger },

  spacer: { flex: 1 },
  actions: { gap: Space.md },
});
