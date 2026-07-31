import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Space } from '@/constants/theme';

/**
 * El aire de los bordes de una pantalla, para ponerlo en el CONTENIDO y no en el contenedor.
 *
 * Es la diferencia entre que el scroll pase por debajo de la barra de estado o que se corte contra
 * ella. Antes cada pantalla se envolvía en `<SafeAreaView edges={['top','bottom']}>` con el color del
 * canvas: eso reserva el hueco del notch como padding del CONTENEDOR, así que el `ScrollView` empieza
 * por debajo y al desplazarse el contenido se recorta en ese borde — dejando una franja opaca del
 * color del papel entre la hora del sistema y lo que estabas leyendo. Se veía como una barrera blanca
 * cortando el titular por la mitad.
 *
 * Poniendo el mismo hueco como `paddingTop` del contenido, el `ScrollView` ocupa la pantalla entera y
 * el contenido se desliza por debajo: nada se corta y las medidas no cambian ni un punto (`insets.top`
 * + `Space.lg` es exactamente lo que sumaban el SafeAreaView y el padding del contenido por separado).
 *
 * `bottom` es lo que la pantalla necesita por su cuenta — `TAB_DOCK` en las pestañas, un respiro
 * normal en las que no la llevan — y aquí se le suma el borde del teléfono.
 */
export function useScreenPadding(bottom: number) {
  const insets = useSafeAreaInsets();

  return {
    /** Para lo primero que va pegado arriba: el notch más el aire de la pantalla. */
    top: insets.top + Space.lg,
    /** Para el final del scroll: lo que pida la pantalla más el borde de abajo del teléfono. */
    bottom: insets.bottom + bottom,
  };
}
