import { useState } from 'react';

import type { AccentName } from '@/constants/theme';

import { BigField } from './big-field';

/**
 * Hora en HH:MM sobre el campo normal. El gemelo de DateField y con el mismo contrato:
 * `onChange` solo recibe un valor cuando la hora esta completa Y es posible; mientras no,
 * recibe null y el motivo se lee debajo del campo.
 *
 * ponytail: mascara de texto y no un picker de reloj. Cuatro digitos de teclado numerico
 * contra dos ruedas, y el teclado ya esta abierto porque se viene de escribir el titulo.
 *
 * Solo entran digitos: los dos puntos los pone la mascara, asi que el teclado es `number-pad`
 * y no hay forma de teclear letras, un segundo ':' ni un signo.
 */
const mask = (digits: string) =>
  [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean).join(':');

const toDigits = (value: string | null) =>
  value && /^\d{2}:\d{2}$/.test(value) ? value.replace(':', '') : '';

/**
 * Se juzga en cuanto hay con que: la hora a los 2 digitos, los minutos a los 4. Asi teclear
 * '25' avisa en el momento en vez de dejarte terminar una hora que no existe.
 */
const reject = (digits: string) => {
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23) return 'La hora va de 00 a 23';
  if (digits.length >= 4 && Number(digits.slice(2, 4)) > 59) return 'Los minutos van de 00 a 59';
  return null;
};

export function TimeField({
  label,
  value,
  onChange,
  error,
  accent,
}: {
  label: string;
  /** 'HH:MM' o null. Solo llega cuando la hora esta completa Y es posible. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  accent?: AccentName;
}) {
  const [text, setText] = useState(() => mask(toDigits(value)));
  const [own, setOwn] = useState<string | null>(null);

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setText(mask(digits));

    const problem = reject(digits);
    setOwn(problem);
    // Media hora no es una hora: hasta los 4 digitos no sale nada del campo.
    onChange(!problem && digits.length === 4 ? mask(digits) : null);
  };

  return (
    <BigField
      label={label}
      value={text}
      onChangeText={handle}
      placeholder="HH:MM"
      keyboardType="number-pad"
      maxLength={5}
      error={own ?? error}
      accent={accent}
    />
  );
}
