import { type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { OtpInput, type OtpInputRef } from 'react-native-otp-entry';

import { Radius, Space, Touch, Type, useAccent, useShadow, useTheme, type AccentName } from '@/constants/theme';

/** Seis, que es lo que emiten los dos catálogos: `CODE` en `domain/otp.js` e `INVITE_CODE` en `domain/invite.js`. */
const DIGITS = 6;

type Props = {
  /** Se le pasa un `OtpInputRef` para poder limpiar y reenfocar después de un error. */
  ref?: Ref<OtpInputRef>;
  onFilled: (code: string) => void;
  /** Para apagar el error en cuanto se vuelve a teclear. */
  onType?: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
  accent?: AccentName;
  /** Cuántas celdas. Seis en los tres usos de hoy; existe para no cablear el número aquí dentro. */
  length?: number;
  /**
   * Qué se puede teclear.
   *
   * `numeric` para los códigos de correo, que son dígitos. `alphanumeric` para los de invitación, que
   * son base32 — y ahí el teclado numérico dejaría a la persona sin poder escribir la mitad del código.
   */
  type?: 'numeric' | 'alphanumeric';
};

/**
 * Las seis celdas del código.
 *
 * Salió de `verify.tsx` cuando apareció la segunda pantalla que pide un código (recuperar
 * contraseña). Lo que se extrae no es la maquetación —eso serían veinte líneas repetidas y ya— sino
 * la advertencia de abajo: `autoComplete` no se puede pasar aquí, y descubrirlo cuesta una tarde.
 * Duplicado, alguien vuelve a pisarlo en seis meses.
 *
 * React 19: `ref` es una prop normal, sin `forwardRef`.
 */
export function CodeField({
  ref,
  onFilled,
  onType,
  error,
  disabled,
  accent = 'olive',
  length = DIGITS,
  type = 'numeric',
}: Props) {
  const th = useTheme();
  const shadow = useShadow();
  const tint = useAccent(accent).ink;

  return (
    <OtpInput
      ref={ref}
      numberOfDigits={length}
      type={type}
      autoFocus
      blurOnFilled
      focusColor={tint}
      disabled={disabled}
      onTextChange={onType}
      onFilled={onFilled}
      // No pasar autoComplete aqui: la libreria ya pone oneTimeCode / sms-otp y esto
      // se hace spread despues, asi que los pisaria.
      textInputProps={{
        // El rótulo dice lo que de verdad se puede teclear: "6 dígitos" en un campo alfanumérico
        // manda a quien usa un lector de pantalla a buscar un teclado que no es.
        accessibilityLabel: `Código de ${length} ${type === 'numeric' ? 'dígitos' : 'caracteres'}`,
        autoCorrect: false,
        autoCapitalize: type === 'numeric' ? 'none' : 'characters',
      }}
      theme={{
        containerStyle: styles.cells,
        pinCodeContainerStyle: {
          ...styles.cell,
          borderColor: th.textMuted,
          backgroundColor: th.surface,
          ...(error && { borderColor: th.danger, borderWidth: 1.5 }),
        },
        filledPinCodeContainerStyle: { borderColor: th.text },
        focusedPinCodeContainerStyle: { borderWidth: 1.5, ...shadow },
        disabledPinCodeContainerStyle: { backgroundColor: th.sunken, borderColor: th.line },
        pinCodeTextStyle: { ...styles.digit, color: th.text },
        focusStickStyle: { ...styles.stick, backgroundColor: tint },
      }}
    />
  );
}

const styles = StyleSheet.create({
  cells: { gap: Space.sm },
  cell: {
    // flex gana sobre el width: 44 de la libreria, asi las 6 celdas reparten el ancho
    // desde un iPhone SE hasta un Max sin numeros magicos.
    flex: 1,
    height: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    // El borde vacio ES la instruccion ("hay seis huecos"), asi que va en muted, no en line.
  },
  // letterSpacing 0 pisa el tracking negativo de metric: en un glifo solo lo descuadra.
  digit: { ...Type.metric, letterSpacing: 0 },
  stick: { width: 2, height: 24, borderRadius: Radius.pill },
});
