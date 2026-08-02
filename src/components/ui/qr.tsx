import QRCode from 'qrcode';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/**
 * Un QR, pintado con `react-native-svg`.
 *
 * **La matriz la calcula `qrcode` y no nosotros.** Se escribió primero un codificador a mano —el
 * algoritmo es público y `react-native-svg` ya estaba instalado, así que parecía una dependencia que
 * ahorrarse— y se tiró: la información de formato y la máscara son las dos partes que, si están mal,
 * producen un código que SE VE PERFECTO y no lo lee ningún lector. Eso no se puede verificar mirando
 * una captura, y "parece un QR" no es que funcione.
 *
 * `qrcode` es JavaScript puro, así que no añade nada nativo ni obliga a reconstruir. Lo único que
 * queda aquí es el pintado, que sí se verifica mirando.
 */
export function Qr({
  value,
  size = 200,
  color = '#000',
}: {
  value: string;
  size?: number;
  color?: string;
}) {
  /**
   * Corrección M: aguanta que se pierda un 15% del código.
   *
   * Es el nivel correcto para algo que se escanea de una pantalla a otra — no hay tinta que se
   * corra ni papel que se doble, pero sí reflejos y una cámara moviéndose. Subir a Q o H haría el
   * código más denso sin comprar nada aquí.
   */
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const modules = qr.modules.size;
  /**
   * La zona de silencio NO es decorativa: sin ella un lector no distingue dónde acaba el código y
   * empieza la pantalla, y el escaneo falla justo cuando el QR está sobre un fondo con textura.
   * Cuatro módulos es lo que pide el estándar.
   */
  const QUIET = 4;
  const unit = size / (modules + QUIET * 2);

  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (qr.modules.get(x, y)) cells.push({ x, y });
    }
  }

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {cells.map(({ x, y }) => (
          <Rect
            key={`${x}-${y}`}
            x={(x + QUIET) * unit}
            y={(y + QUIET) * unit}
            /*
              Medio punto de más en cada lado para que los módulos se solapen: sin eso, el redondeo
              del renderer deja hilos blancos entre cuadros y hay lectores que se atragantan.
            */
            width={unit + 0.5}
            height={unit + 0.5}
            fill={color}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Blanco SIEMPRE, también en modo oscuro.
   *
   * Un QR invertido —claro sobre oscuro— lo lee bastante menos de la mitad de los lectores, y el de
   * iOS es de los que no. El recuadro blanco es parte del código, no del tema.
   */
  frame: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
});
