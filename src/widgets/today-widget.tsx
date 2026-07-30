import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Props planas y primitivas a proposito: cruzan al proceso de la extension, y objetos
 * anidados o Date no sobreviven el viaje. Todo el formateo se hace en la app antes de
 * mandar el snapshot — el widget solo pinta.
 */
export type TodayWidgetProps = {
  /** '' cuando no queda nada pendiente. */
  nextTitle: string;
  /** '18:00' o 'sin hora'. Vacio si no hay siguiente. */
  nextTime: string;
  pending: number;
  done: number;
  /** Titulo de la tarea con el cronometro corriendo, '' si ninguna. */
  running: string;
};

/**
 * "Tu día" en la pantalla de inicio: que sigue y cuanto falta.
 *
 * Es la respuesta a "¿en que estaba?" sin abrir la app, que para TDAH es justo donde se
 * pierde el hilo. Por eso lo primero y mas grande es UNA tarea, no una lista: un widget
 * con siete pendientes reproduce la misma paralisis que la app.
 *
 * El widget hereda el modo claro/oscuro del sistema por si solo, asi que aqui no se fija
 * ningun color de fondo ni de texto plano: `secondary` es el gris del sistema y el texto
 * principal usa el color por defecto, que ya se invierte.
 */
const TodayWidget = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const small = environment.widgetFamily === 'systemSmall';
  const hasNext = props.nextTitle.length > 0;

  return (
    <VStack spacing={6}>
      <HStack>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor('secondary')]}>
          {props.running ? 'AHORA' : 'LO QUE SIGUE'}
        </Text>
        <Spacer />
        {!small && (
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor('secondary')]}>
            {`${props.done}/${props.done + props.pending}`}
          </Text>
        )}
      </HStack>

      <Text
        modifiers={[
          font({ size: small ? 17 : 20, weight: 'bold', design: 'rounded' }),
          lineLimit(small ? 3 : 2),
        ]}>
        {props.running || (hasNext ? props.nextTitle : 'Nada pendiente')}
      </Text>

      <Spacer />

      <Text modifiers={[font({ size: 13 }), foregroundColor('secondary')]}>
        {props.running
          ? 'Cronómetro corriendo'
          : hasNext
            ? props.nextTime
            : `${props.done} hechas hoy`}
      </Text>
    </VStack>
  );
};

export default createWidget('TodayWidget', TodayWidget);
