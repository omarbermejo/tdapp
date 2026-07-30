import { useState } from 'react';

import type { AccentName } from '@/constants/theme';

import { BigField } from './big-field';

/**
 * Fecha en DD/MM/AAAA sobre el campo normal.
 *
 * ponytail: mascara de texto en vez de un picker nativo. Para una fecha de nacimiento el
 * picker es peor: son tres ruedas y decenas de giros hasta 1995, contra ocho digitos de
 * teclado numerico. Techo: no valida que la fecha exista; eso lo dice el API en fields.birthDate.
 */
const mask = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');

const toIso = (digits: string) => `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;

const toDigits = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : '';

export function DateField({
  label,
  value,
  onChange,
  error,
  accent,
}: {
  label: string;
  /** ISO 'YYYY-MM-DD' o null. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  accent?: AccentName;
}) {
  const [text, setText] = useState(() => mask(toDigits(value)));

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setText(mask(digits));
    // Solo se manda cuando esta completa: media fecha no es una fecha.
    onChange(digits.length === 8 ? toIso(digits) : null);
  };

  return (
    <BigField
      label={label}
      value={text}
      onChangeText={handle}
      placeholder="DD/MM/AAAA"
      keyboardType="number-pad"
      maxLength={10}
      error={error}
      accent={accent}
    />
  );
}
