import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { HEX, isHex, normalizeHex } from '@/constants/color';
import {
  Motion,
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useTheme,
  type AccentName,
} from '@/constants/theme';
import { ACCENT_COLOR } from '@/features/auth/options';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * El diametro de una muestra. `Touch.chip` (48) es el minimo tocable y ademas el tamaño al que un
 * color se lee como color y no como un punto.
 */
const DOT = Touch.chip;

/** El aro del elegido. Va SIEMPRE, y solo cambia de color: animar el grosor movia la rejilla. */
const RING = 3;

/**
 * El selector de color de un acento: once muestras y "Otro".
 *
 * Sustituye al `Choice` de dos columnas con etiqueta que habia antes, y el motivo es el catalogo: con
 * cinco colores una lista con nombre al lado cabia en tres filas; con once son seis, y leer "Ciruela"
 * junto a un circulo ciruela es decir lo mismo dos veces. En una rejilla de muestras el color ES la
 * opcion, que es justo lo que ya decia el docstring de `ACCENT_COLOR`.
 *
 * El nombre no se pierde: viaja en `accessibilityLabel`, que es donde de verdad hace falta — un lector
 * de pantalla no ve el circulo.
 *
 * **"Otro" es el mismo mecanismo, no una excepcion.** Un hex tecleado y uno de los seis colores nuevos
 * recorren el mismo `deriveRamp`, asi que lo que se pinta con un color propio esta tan medido como lo
 * demas: su paso legible se empuja hasta 4.5:1 sobre el papel del esquema.
 */
export function AccentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (accent: AccentName) => void;
}) {
  const t = useTheme();
  /** Lo tecleado en "Otro". Arranca con el valor si YA era un hex, para poder corregirlo. */
  const [typed, setTyped] = useState(isHex(value) ? value : '');
  const custom = isHex(value);
  const [open, setOpen] = useState(custom);

  /**
   * Elegir una muestra cierra el campo, y lo hace en el `onPress` y no en un efecto: `set-state-in-
   * effect` esta en `error` en este repo, y ademas cerrar es la consecuencia del TOQUE, no del valor.
   */
  const choose = (accent: AccentName) => {
    setOpen(false);
    onChange(accent);
  };

  const apply = (raw: string) => {
    setTyped(raw);
    // Se aplica en cuanto es valido, sin boton de confirmar: el color se ve al momento en toda la
    // pantalla, y eso ES la confirmacion. Mientras no lo sea, no se toca nada.
    if (HEX.test(raw.trim())) onChange(normalizeHex(raw) as AccentName);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {ACCENT_COLOR.map((option) => (
          <Swatch
            key={option.value}
            accent={option.value as AccentName}
            label={option.label}
            on={value === option.value}
            onPress={() => choose(option.value as AccentName)}
          />
        ))}

        {/*
          "Otro" es una muestra mas y no un boton aparte: en la misma rejilla se lee como la doceava
          opcion, que es lo que es. Cuando hay un color propio elegido, la muestra ES ese color.
        */}
        <Swatch
          accent={custom ? (value as AccentName) : undefined}
          label="Otro color"
          on={custom}
          onPress={() => setOpen(!open)}
          mark="+"
        />
      </View>

      {open && (
        <Animated.View
          entering={FadeInDown.duration(Motion.enter)}
          style={[styles.field, { backgroundColor: t.sunken }]}>
          {/* La almohadilla la pone la app: nadie deberia tener que acordarse de escribirla. */}
          <Text style={[Type.title, { color: t.textMuted }]}>#</Text>
          <TextInput
            value={typed.replace('#', '')}
            onChangeText={(raw) => apply(`#${raw.replace(/[^0-9a-fA-F]/g, '')}`)}
            placeholder="c17f86"
            placeholderTextColor={t.textMuted}
            selectionColor={t.text}
            style={[Type.title, styles.input, { color: t.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={6}
            keyboardType="ascii-capable"
            accessibilityLabel="Color en hexadecimal"
          />
        </Animated.View>
      )}
    </View>
  );
}

/** Una muestra. Aparte porque cada una necesita su propio `useAccent` y su propia escala de toque. */
function Swatch({
  accent,
  label,
  on,
  onPress,
  mark,
}: {
  accent?: AccentName;
  label: string;
  on: boolean;
  onPress: () => void;
  /** El glifo de "Otro" cuando todavia no hay color propio. */
  mark?: string;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.9 });
  const empty = !accent && !!mark;

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.dot,
          {
            backgroundColor: empty ? t.sunken : tint.solid,
            // El aro vive siempre y solo cambia de color. Al elegido se le pone su propia tinta, que
            // es el unico paso del acento que se distingue de su relleno.
            borderColor: on ? tint.ink : t.line,
          },
        ]}>
        {!!mark && !accent && <Text style={[Type.section, { color: t.textMuted }]}>{mark}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: Touch.input,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
  },
  // `flex: 1` para que el campo mida la fila y el cursor no se quede pegado a la almohadilla.
  input: { flex: 1, letterSpacing: 2 },
});
