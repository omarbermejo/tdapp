import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { FormError } from './form-error';
import { Radius, Space, Theme, Touch, Type, accentOf, type AccentName } from '@/constants/theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  accent?: AccentName;
};

/** Campo de papel con hairline: al enfocar el borde se tine del acento, y el error se lee debajo. */
export function BigField({ label, error, accent = 'olive', style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const tint = accentOf(accent).ink;
  const active = focused || !!error;

  return (
    <View style={styles.wrap}>
      <Text style={[Type.micro, styles.label]}>{label}</Text>
      <TextInput
        placeholderTextColor={Theme.textMuted}
        selectionColor={tint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          // El borde solo engorda a 1.5pt cuando hay algo que decir (foco o error).
          active && styles.inputActive,
          { borderColor: error ? Theme.danger : focused ? tint : Theme.line },
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
  label: { color: Theme.textMuted },
  input: {
    minHeight: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Theme.surface,
    color: Theme.text,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
  },
  inputActive: { borderWidth: 1.5 },
});
