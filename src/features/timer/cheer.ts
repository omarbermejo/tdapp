import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/**
 * La celebracion de cerrar un bloque: sonido y vibracion, juntos y sincronizados.
 *
 * Antes solo sonaba la notificacion del sistema, y eso tenia dos problemas: no es un sonido de esta
 * app (es el "ding" genérico del telefono) y sobre todo **queda muda con el interruptor de silencio**.
 * Un cronometro que la persona armo a proposito tiene que sonar igual que suena una alarma del reloj,
 * asi que la sesion de audio se abre con `playsInSilentMode`.
 *
 * `mixWithOthers` es la otra mitad: enfocarse con musica es la mitad de los pomodoros que existen, y
 * un sonido de cierre que le baje la musica al usuario cada 25 minutos es peor que no tenerlo.
 *
 * NUNCA lanza. Si el audio no carga, el patron de vibracion sale igual — y al revés. Los dos son la
 * misma señal por dos canales distintos, y perder uno no puede llevarse el otro.
 *
 * `expo-audio` se importa de forma ESTATICA, al contrario que `expo-notifications`: tiene build web
 * propio (AudioPlayer.web.js), asi que no rompe la web, y es el patron del resto del proyecto
 * (expo-glass-effect, expo-symbols y expo-haptics tambien entran arriba). Con `await import()` el
 * async require de Metro reventaba con "Requiring unknown module" mientras el grafo del bundler
 * seguia con el estado de antes de instalar el paquete.
 */

/** Que se cerro: un bloque cualquiera, o el ciclo entero de cuatro enfoques. */
export type Cheer = 'block' | 'cycle';

/**
 * Los golpes hapticos caen sobre las notas del arpegio (que empiezan en 0, 85, 170 y 255 ms), asi
 * que el sonido y la mano dicen lo mismo al mismo tiempo. Sin esa coincidencia se sienten como dos
 * avisos sueltos que se pisan.
 *
 * `Success` va al FINAL y no al principio: es un patron doble de por si, y arrancar con el le roba el
 * acento a la subida.
 */
const IOS_STEPS: Record<Cheer, { at: number; run: () => Promise<void> }[]> = {
  block: [
    { at: 0, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) },
    { at: 85, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) },
    { at: 170, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) },
    { at: 255, run: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
  ],
  cycle: [
    { at: 0, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) },
    { at: 80, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) },
    { at: 160, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) },
    { at: 240, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) },
    { at: 340, run: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy) },
    { at: 440, run: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
    { at: 560, run: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
  ],
};

/**
 * En Android el patron va por `Vibration`, no por hapticos.
 *
 * Core Haptics no existe alla: `impactAsync` cae en un solo tic corto del motor, y encadenar siete
 * con setTimeout suena a matraca. `Vibration.vibrate` acepta un patron de verdad — pares de
 * espera/vibra en milisegundos — y es lo que se siente como una celebracion.
 *
 * (En iOS el patron se ignora y vibra una vez de golpe, feo; por eso ahi se usan los hapticos.)
 */
const ANDROID_PATTERN: Record<Cheer, number[]> = {
  block: [0, 55, 45, 55, 45, 110],
  cycle: [0, 45, 40, 45, 40, 45, 40, 90, 60, 180],
};

/** Los dos sonidos, creados una vez. `null` hasta que `warmCheer` los prepara. */
let players: Record<Cheer, AudioPlayer> | null = null;
/** Los timers en vuelo, para poder cortarlos si la pantalla se va a media celebracion. */
let pending: ReturnType<typeof setTimeout>[] = [];

/**
 * Prepara la sesion de audio y carga los sonidos. La pantalla la llama al montar.
 *
 * Existe separada de `cheer()` porque crear el player y abrir la sesion de audio la primera vez tarda
 * lo suficiente para que el sonido llegue tarde — y un sonido de cierre que suena medio segundo
 * despues del cero se siente roto. Precargando, `cheer()` solo rebobina y toca.
 */
export async function warmCheer() {
  if (players) return;

  try {
    await setAudioModeAsync({
      // Suena aunque el telefono este en silencio: es una alarma que la persona programo.
      playsInSilentMode: true,
      // No corta ni baja lo que ya esté sonando (musica, un podcast) — solo se suma encima.
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });

    players = {
      block: createAudioPlayer(require('@/assets/sounds/chime.wav')),
      cycle: createAudioPlayer(require('@/assets/sounds/fanfare.wav')),
    };
  } catch {
    // Sin audio nativo (web, o un binario sin el modulo): la vibracion se encarga sola.
    players = null;
  }
}

/** Suelta los players y corta los timers. La pantalla la llama al desmontar. */
export function coolCheer() {
  pending.forEach(clearTimeout);
  pending = [];

  const open = players;
  players = null;
  if (!open) return;
  try {
    // `createAudioPlayer` no libera solo (a diferencia del hook), asi que hay que pedirlo.
    Object.values(open).forEach((player) => player.remove());
  } catch {
    // Un player que no se pudo soltar lo recoge el proceso al morir.
  }
}

/** Celebra. Sonido y vibracion salen a la vez y ninguno depende del otro. */
export function cheer(kind: Cheer) {
  play(kind);
  buzz(kind);
}

function play(kind: Cheer) {
  const player = players?.[kind];
  if (!player) return;
  try {
    // Rebobinar antes de tocar: dos bloques seguidos con el player al final no sonarian la segunda
    // vez. `seekTo` es asincrono pero `play()` no espera, asi que el orden es este a proposito.
    player.seekTo(0);
    player.play();
  } catch {
    // El sonido se perdio; la vibracion ya salio.
  }
}

function buzz(kind: Cheer) {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(ANDROID_PATTERN[kind]);
      return;
    }
    if (Platform.OS !== 'ios') return;

    for (const step of IOS_STEPS[kind]) {
      // Los timers se guardan para poder cortarlos: una celebracion a medias que sigue vibrando
      // despues de salir de la pantalla se siente como un fallo.
      pending.push(
        setTimeout(() => {
          step.run().catch(() => {});
        }, step.at)
      );
    }
  } catch {
    // Sin motor haptico no hay nada que hacer.
  }
}
