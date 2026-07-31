import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

/**
 * Los iconos 3D de la app.
 *
 * Este es el UNICO sitio que sabe que son archivos. El mapa de abajo existe porque Metro resuelve
 * `require` en tiempo de compilacion: una plantilla tipo `require('...' + slug)` no compila, asi que
 * cada asset se nombra una vez y quien pinta pide un slug.
 *
 * Vienen ya tintados al color de la app — el tinte se hornea en `scripts/build-icons3d.mjs` a partir
 * de las rampas de `theme.ts`, no se aplica aqui. Por eso NO llevan `tintColor`: son multicolor a
 * proposito y aplanarlos borraria el modelado, que es lo unico que los distingue de un icono plano.
 *
 * Y por eso tampoco hay variante clara/oscura. Cada icono esta asentado en el medio tono de su rampa,
 * o sea que lleva valores oscuros y claros dentro de si mismo y se lee igual sobre el papel de la app
 * que sobre el negro de la Live Activity. Un archivo por icono.
 */

const ICONS = {
  academic: require('@/assets/icons3d/academic.webp'),
  calendar: require('@/assets/icons3d/calendar.webp'),
  check: require('@/assets/icons3d/check.webp'),
  clock: require('@/assets/icons3d/clock.webp'),
  creativity: require('@/assets/icons3d/creativity.webp'),
  'graph-up': require('@/assets/icons3d/graph-up.webp'),
  health: require('@/assets/icons3d/health.webp'),
  home: require('@/assets/icons3d/home.webp'),
  leaf: require('@/assets/icons3d/leaf.webp'),
  light: require('@/assets/icons3d/light.webp'),
  lightning: require('@/assets/icons3d/lightning.webp'),
  money: require('@/assets/icons3d/money.webp'),
  moon: require('@/assets/icons3d/moon.webp'),
  relationships: require('@/assets/icons3d/relationships.webp'),
  trophy: require('@/assets/icons3d/trophy.webp'),
  user: require('@/assets/icons3d/user.webp'),
  work: require('@/assets/icons3d/work.webp'),
} as const;

export type Icon3DName = keyof typeof ICONS;

/**
 * Los tamaños del sistema. Son cuatro y no un numero libre porque un icono 3D tiene un piso: por
 * debajo de `sm` el modelado se empasta y lo que queda es una silueta, que es peor que un trazo.
 *
 * `md` (32) es el de la barra y `lg` el de una fila o una pastilla. `hero` es el techo: mas grande
 * que eso van los stickers de Alteos, que son vectores y no pixelan.
 */
export const Icon3DSize = { sm: 24, md: 32, lg: 44, hero: 88 } as const;

export function Icon3D({
  name,
  size = Icon3DSize.lg,
  style,
}: {
  name: Icon3DName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      // El icono ya lo dice el texto de al lado en todos los sitios donde se usa. Anunciarlo aparte
      // haria que VoiceOver leyera "casa, Casa".
      accessible={false}
    />
  );
}

/** El icono de un area de enfoque. Los nombres son los de `FOCUS_AREAS` en el API. */
export const AREA_ICON: Record<string, Icon3DName> = {
  study: 'academic',
  work: 'work',
  home: 'home',
  health: 'health',
  money: 'money',
  relationships: 'relationships',
  creativity: 'creativity',
};

/** El icono de un tamaño de tarea: un rayo, un reloj y una luna. */
export const SIZE_ICON: Record<string, Icon3DName> = {
  quick: 'lightning',
  medium: 'clock',
  deep: 'moon',
};
