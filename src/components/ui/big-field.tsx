import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';

import { FormError } from './form-error';

type Props = TextInputProps & {
  label: string;
  error?: string;
  accent?: AccentName;
};

/** Campo de papel con hairline: al enfocar el borde se tine del acento, y el error se lee debajo. */
export function BigField({ label, error, accent = 'olive', style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const t = useTheme();
  const tint = useAccent(accent).ink;
  const active = focused || !!error;

  return (
    <View style={styles.wrap}>
      <Text style={[Type.micro, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textMuted}
        selectionColor={tint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          { backgroundColor: t.surface, color: t.text },
          // El borde solo engorda a 1.5pt cuando hay algo que decir (foco o error).
          active && styles.inputActive,
          { borderColor: error ? t.danger : focused ? tint : t.line },
          style,
        ]}
        {...rest}
      />
      <FormError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  input: {
    minHeight: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
  },
  inputActive: { borderWidth: 1.5 },
});
