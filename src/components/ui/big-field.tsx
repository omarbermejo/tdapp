import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { AccentName, Accents, Brand, Radius, Touch, Type } from '@/constants/brand';

type Props = TextInputProps & {
  label: string;
  error?: string;
  accent?: AccentName;
};

/** Campo alto, borde de 3pt que se enciende al enfocar y error visible sin buscarlo. */
export function BigField({ label, error, accent = 'electric', style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? Brand.danger : focused ? Accents[accent] : Brand.inkLine;

  return (
    <View style={styles.wrap}>
      <Text style={[Type.label, styles.label]}>{label}</Text>
      <TextInput
        placeholderTextColor={Brand.textMute}
        selectionColor={Accents[accent]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, { borderColor }, style]}
        {...rest}
      />
      {!!error && <Text style={[Type.hint, styles.error]}>⚠︎ {error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: Brand.text },
  input: {
    minHeight: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 3,
    backgroundColor: Brand.inkSoft,
    color: Brand.text,
    paddingHorizontal: 18,
    fontSize: 18,
    fontWeight: '600',
  },
  error: { color: Brand.danger },
});
