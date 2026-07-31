import { HStack, Image, Link, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Sin datos de verdad: solo el acento y cuantas quedan.
 *
 * El widget funciona igual con los props vacios, y eso es a proposito — es el unico que sirve antes de
 * que la app haya sincronizado nada.
 */
export type CaptureWidgetProps = {
  /** Pendientes de hoy. 0 tambien es una respuesta valida. */
  pending: number;
  tint: string;
  tintDark: string;
};

/**
 * Anotar en un toque desde la pantalla de inicio.
 *
 * Es el widget mas simple y probablemente el mas util: lo que se pierde con TDAH no es la tarea, es
 * el segundo entre acordarse y abrir la app. Un atajo a `/new-task` desde el inicio salta el home, la
 * pestaña y el boton.
 *
 * Va con `Link` y no con `Button`: un `Button` de widget ejecuta su `onPress` en un JSContext PELADO
 * dentro de la extension (sin red, sin async) y solo puede devolver props nuevos — no puede abrir la
 * app. `Link` es justo lo contrario: no ejecuta nada, abre la URL. Y `LinkView` esta en la allowlist
 * del renderer de widgets, asi que funciona.
 *
 * El layout se serializa como fuente y se evalua suelto: NO captura nada de fuera.
 */
const CaptureWidget = (props: CaptureWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;
  const inline = family === 'accessoryInline';
  const lock = inline || family === 'accessoryCircular' || family === 'accessoryRectangular';

  // En la pantalla de bloqueo el sistema pinta monocromo y un color propio se ignora o se ve sucio.
  const ink = lock ? undefined : environment.colorScheme === 'dark' ? props.tintDark : props.tint;

  /**
   * `Link` envuelve TODO el widget, no solo el texto: en un widget de pantalla de inicio el area de
   * toque es la baldosa entera, y un enlace que solo cubre dos palabras se siente roto.
   *
   * Tres barras en la URL: el esquema es 'tdapp' y expo-router lee la ruta del PATH, asi que
   * 'tdapp://new-task' dejaria 'new-task' como host y la ruta vacia.
   */
  if (inline) {
    return <Link destination="tdapp:///new-task" label="Anotar algo" />;
  }

  return (
    <Link destination="tdapp:///new-task">
      <VStack spacing={8}>
        <Image systemName="square.and.pencil" size={26} color={ink} />

        <Text
          modifiers={[
            font({ size: 15, weight: 'semibold' }),
            lineLimit(1),
            ...(ink ? [foregroundColor(ink)] : []),
          ]}>
          Anotar algo
        </Text>

        {/*
          La linea de abajo dice cuantas quedan, no "toca para anotar": lo segundo explica el boton (y
          un boton que necesita explicacion no sirve), y lo primero es el dato que hace decidir.
        */}
        <HStack spacing={4}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundColor('secondary'),
              lineLimit(1),
            ]}>
            {props.pending === 0
              ? 'Nada pendiente'
              : props.pending === 1
                ? '1 pendiente hoy'
                : `${props.pending} pendientes hoy`}
          </Text>
        </HStack>
      </VStack>
    </Link>
  );
};

export default createWidget<CaptureWidgetProps>('CaptureWidget', CaptureWidget);
