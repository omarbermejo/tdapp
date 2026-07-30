import { StyleSheet, Text } from 'react-native';

import { Space, Type, useTheme } from '@/constants/theme';

/**
 * El unico lugar donde se pinta un error para la persona.
 *
 * Lleva el simbolo siempre: el color solo no basta, quien no distingue el rojo del
 * verde no veria que algo fallo. `role="alert"` hace que VoiceOver lo lea al aparecer
 * sin que el usuario tenga que ir a buscarlo.
 *
 * Los mensajes que llegan aqui salen del API o son textos nuestros; nunca URLs,
 * codigos de estado ni excepciones — eso se queda en la consola de desarrollo.
 */
export function FormError({ message }: { message?: string | null }) {
  const t = useTheme();
  if (!message) return null;

  return (
    <Text role="alert" style={[styles.text, { color: t.danger }]}>
      ⚠︎ {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...Type.hint, marginTop: Space.xs },
});
