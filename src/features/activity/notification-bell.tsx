import { router } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import { StyleSheet, View } from 'react-native';

import { HeaderAction } from '@/components/ui/screen-header';
import { useAccent, useTheme, type AccentName } from '@/constants/theme';

import { useActivity } from './activity-context';

/** Lado del punto. Diez puntos se ven a un metro y no tapan el icono. */
const DOT = 10;

/**
 * La campana, con su señal de que hay algo.
 *
 * **Un punto y no un numero.** Un "12" en la esquina del inicio es deuda pintada: cuantifica el
 * retraso y convierte la campana en una cuenta pendiente. El punto dice "hay algo" y ya — es el
 * mismo criterio con el que la racha en cero no imprime un `0`, porque un cero en tamaño de metrica
 * se lee como un reproche.
 *
 * **El punto va en `ink` del acento, no en `danger`.** `danger` diria "algo salio mal", que es falso;
 * `ink` es el unico paso de la rampa que pasa AA y es el mismo color con el que la llama dice
 * "encendido" — dos marcas en la misma esquina hablando el mismo idioma.
 *
 * El contador solo sube con lo que hizo OTRA persona: en el espacio personal tu eres siempre el
 * actor, asi que hoy la campana vive apagada y la pantalla es un historial. El dia que alguien toque
 * tus tareas en un espacio compartido, se enciende sola sin tocar este archivo.
 */
export function NotificationBell({ accent }: { accent?: AccentName }) {
  const t = useTheme();
  const tint = useAccent(accent);
  const { unread } = useActivity();

  return (
    // Sin tamaño propio: envuelve al boton y el punto se cuelga de su esquina.
    <View>
      <HeaderAction
        icon={Bell}
        label={unread > 0 ? `Novedades, ${unread} sin ver` : 'Novedades'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 && (
        // `pointerEvents="none"`: el punto no puede comerse el toque del boton que decora.
        <View
          pointerEvents="none"
          style={[styles.dot, { backgroundColor: tint.ink, borderColor: t.canvas }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    // El anillo del color del papel lo despega del circulo del boton, que tambien es claro.
    borderWidth: 2,
  },
});
