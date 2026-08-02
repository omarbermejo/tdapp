import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Radius, Space, Type, useTheme } from '@/constants/theme';

import { codeFromLink } from './invite-link';

/**
 * La cámara, para leer el QR de una invitación.
 *
 * **Un `Modal` y no una ruta.** Es el mismo argumento por el que anotar es una hoja: esto es un
 * paréntesis de tres segundos dentro de "unirme a un espacio", y una ruta propia dejaría una entrada
 * en el historial a la que volver con el gesto de atrás — a una cámara que ya cumplió.
 *
 * Solo lee QR: `barcodeScannerSettings` acota los tipos. Sin acotarlo, la vista intenta reconocer
 * catorce formatos en cada frame, y los códigos de barras de un producto cualquiera que pase por
 * delante disparan lecturas que hay que descartar.
 */
export default function QrScanner({
  onFound,
  onClose,
}: {
  onFound: (code: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();

  /**
   * Ya se leyó uno. Es un ref y no estado a propósito.
   *
   * `onBarcodeScanned` dispara en CADA frame que contiene el código — treinta veces por segundo
   * mientras el QR siga delante. Sin este cerrojo, la primera lectura llama a `onFound`, la pantalla
   * empieza a navegar, y las veintinueve siguientes vuelven a llamarlo sobre un componente que ya se
   * está yendo. Un ref porque tiene que valer en el MISMO tick, antes de cualquier render.
   */
  const caught = useRef(false);

  const body = () => {
    // Todavía no se ha preguntado: `useCameraPermissions` devuelve null hasta que resuelve.
    if (!permission) return null;

    if (!permission.granted) {
      return (
        <View style={styles.ask}>
          <Text style={[Type.title, styles.centerText, { color: t.onInk }]}>
            Necesito la cámara para leer el código
          </Text>
          <Text style={[Type.body, styles.centerText, { color: t.onInk }]}>
            Solo se usa aquí, y solo mientras esta pantalla esté abierta.
          </Text>
          {/*
            `canAskAgain` en false significa que ya dijo que no y iOS no vuelve a preguntar: el botón
            tiene que llevar a Ajustes, no repetir una pregunta que el sistema va a ignorar.
          */}
          <BigButton
            label={permission.canAskAgain ? 'Permitir la cámara' : 'Abrir Ajustes'}
            onPress={() => void request()}
          />
        </View>
      );
    }

    return (
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (caught.current) return;
          const code = codeFromLink(data);
          // Un QR que no es de la app se ignora en silencio: la cámara sigue abierta y el siguiente
          // frame puede traer el bueno. Un error aquí sería ruido por apuntar a la etiqueta de al lado.
          if (!code) return;
          caught.current = true;
          onFound(code);
        }}
      />
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {body()}

        {/*
          La mirilla. No recorta la lectura —la cámara lee todo el cuadro— pero dice DÓNDE poner el
          código, que es la mitad de que el escaneo salga a la primera.
        */}
        {permission?.granted && (
          <View pointerEvents="none" style={styles.center}>
            <View style={styles.reticle} />
          </View>
        )}

        <View style={[styles.actions, { paddingBottom: insets.bottom + Space.xl }]}>
          <BigButton label="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** Negro y no el canvas: es una cámara, y el papel de la app aquí sería un marco que estorba. */
  screen: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 240,
    height: 240,
    borderRadius: Radius.lg,
    borderWidth: 3,
    borderColor: '#fff',
    opacity: 0.9,
  },
  ask: { padding: Space.xl, gap: Space.lg },
  /** Centrar TEXTO, no colocarlo: `center` es absolute y sobre un <Text> lo saca del flujo. */
  centerText: { textAlign: 'center' },
  actions: { position: 'absolute', left: Space.xl, right: Space.xl, bottom: 0 },
});
