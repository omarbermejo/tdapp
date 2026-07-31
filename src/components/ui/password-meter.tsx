import { StyleSheet, Text, View } from 'react-native';

import { Radius, Space, Type, useAccent, useTheme } from '@/constants/theme';

/**
 * Lo unico que el API exige. Mantener sincronizado con MIN_PASSWORD de domain/user.js.
 *
 * Este archivo es el unico sitio de la app donde vive ese numero, y por eso el medidor se MUDO aqui
 * en vez de copiarse a la pantalla de recuperar contraseña: un comentario que pide sincronia no
 * puede existir en dos archivos, porque asi es como empieza la deriva.
 */
export const MIN_PASSWORD = 8;
const LEVELS = 3;

/**
 * Los 8 caracteres son el muro; el resto es consejo. Mientras la contrasena no llega al
 * minimo el tono es neutro y dice cuanto falta: el rojo se guarda para un rechazo real.
 */
export function strengthOf(password: string) {
  if (password.length < MIN_PASSWORD) {
    const left = MIN_PASSWORD - password.length;
    return { level: 1, valid: false, hint: `Te ${left === 1 ? 'falta' : 'faltan'} ${left}` };
  }

  const variety = [/\d/, /[a-zA-Z]/, /[^\w\s]/].filter((rule) => rule.test(password)).length;
  return variety >= 3 || password.length >= 12
    ? { level: 3, valid: true, hint: 'Buena contraseña.' }
    : { level: 2, valid: true, hint: 'Ya sirve. Un número o un símbolo la hacen más fuerte.' };
}

/** Tres tramos del mismo riel que usa la rama de progreso: un solo idioma en toda la app. */
export function PasswordMeter({ password }: { password: string }) {
  const t = useTheme();
  const olive = useAccent('olive');
  const { level, valid, hint } = strengthOf(password);

  return (
    <View style={styles.meter}>
      <View style={styles.meterRow}>
        {Array.from({ length: LEVELS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: t.line },
              !!password && i < level && { backgroundColor: valid ? olive.ink : t.textMuted },
            ]}
          />
        ))}
      </View>
      {/* Alto fijo: al escribir el primer caracter no salta el campo de abajo. */}
      <Text style={[Type.hint, styles.meterHint, { color: t.textMuted }]}>{password ? hint : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { gap: Space.xs },
  meterRow: { flexDirection: 'row', gap: Space.xs },
  segment: { flex: 1, height: 4, borderRadius: Radius.pill },
  meterHint: { minHeight: 20 },
});
