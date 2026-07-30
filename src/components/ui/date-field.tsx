import { useState } from 'react';

import type { AccentName } from '@/constants/theme';

import { BigField } from './big-field';

/**
 * Fecha en DD/MM/AAAA sobre el campo normal.
 *
 * ponytail: mascara de texto en vez de un picker nativo. Para una fecha de nacimiento el
 * picker es peor: son tres ruedas y decenas de giros hasta 1995, contra ocho digitos de
 * teclado numerico.
 *
 * El precio de la mascara es que se puede teclear cualquier cosa, y "22/08/8787" se veia
 * perfectamente valido hasta que el API lo rechazaba. Asi que valida aqui tambien: mientras
 * la fecha no sea real y posible, no sale del campo (onChange recibe null) y el motivo se lee
 * debajo. Las reglas espejan las de createProfile en el API — hay que mantenerlas en sinc.
 */
const MIN_DATE = '1920-01-01';
const MIN_AGE = 5;

const mask = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');

const toIso = (digits: string) => `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;

const toDigits = (iso: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}` : '';

/** Ir y volver por ISO delata cualquier dia que no existe: Date corre el 31/02 a marzo. */
const isReal = (iso: string) => new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

/** La fecha de quien cumple MIN_AGE hoy. En ISO, comparar fechas es comparar texto. */
const youngest = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const reject = (iso: string) => {
  if (!isReal(iso)) return 'Ese día no existe';
  if (iso < MIN_DATE) return 'Revisa el año';
  if (iso > youngest()) return 'Revisa el año: sale una fecha en el futuro o muy reciente';
  return null;
};

export function DateField({
  label,
  value,
  onChange,
  error,
  accent,
}: {
  label: string;
  /** ISO 'YYYY-MM-DD' o null. Solo llega cuando la fecha esta completa Y es valida. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  accent?: AccentName;
}) {
  const [text, setText] = useState(() => mask(toDigits(value)));
  const [own, setOwn] = useState<string | null>(null);

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    setText(mask(digits));

    // Media fecha no es una fecha: hasta los 8 digitos no se opina ni se manda nada.
    if (digits.length < 8) {
      setOwn(null);
      return onChange(null);
    }

    const iso = toIso(digits);
    const problem = reject(iso);
    setOwn(problem);
    onChange(problem ? null : iso);
  };

  return (
    <BigField
      label={label}
      value={text}
      onChangeText={handle}
      placeholder="DD/MM/AAAA"
      keyboardType="number-pad"
      maxLength={10}
      error={own ?? error}
      accent={accent}
    />
  );
}
