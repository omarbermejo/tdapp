import type { Option } from '@/components/ui/choice';
import { Accents } from '@/constants/theme';

/**
 * Etiquetas en español para los catalogos del backend (GET /auth/catalogs).
 *
 * No hay diagnostico ni tratamiento: son dato clinico que la app no usa y eran las dos
 * preguntas que mas gente dejaba a medias.
 *
 * Los iconos son de Lucide (ISC, el aviso de licencia viaja dentro de cada .svg) con el
 * trazo cambiado a la tinta de la marca. No son los stickers de Alteos a proposito: a 26pt
 * dentro de un chip una ilustracion con trama de puntos se vuelve papilla, y el diseño de
 * referencia usa justo iconos de linea en sus controles. Las ilustraciones de Alteos siguen
 * siendo los heroes de pantalla (welcome y el ultimo paso del onboarding), asi que el sistema
 * queda en dos niveles: ilustracion para heroes, linea para controles.
 */
export const FOCUS_AREAS: readonly Option[] = [
  { value: 'study', label: 'Estudio', icon: require('@/assets/icons/chips/study.svg') },
  { value: 'work', label: 'Trabajo', icon: require('@/assets/icons/chips/work.svg') },
  { value: 'home', label: 'Casa', icon: require('@/assets/icons/chips/home.svg') },
  { value: 'health', label: 'Salud', icon: require('@/assets/icons/chips/health.svg') },
  { value: 'money', label: 'Dinero', icon: require('@/assets/icons/chips/money.svg') },
  {
    value: 'relationships',
    label: 'Relaciones',
    icon: require('@/assets/icons/chips/relationships.svg'),
  },
  { value: 'creativity', label: 'Creatividad', icon: require('@/assets/icons/chips/creativity.svg') },
];

export const PEAK_ENERGY: readonly Option[] = [
  { value: 'morning', label: 'Mañana', icon: require('@/assets/icons/chips/morning.svg') },
  { value: 'afternoon', label: 'Tarde', icon: require('@/assets/icons/chips/afternoon.svg') },
  { value: 'night', label: 'Noche', icon: require('@/assets/icons/chips/night.svg') },
  { value: 'varies', label: 'Cambia mucho', icon: require('@/assets/icons/chips/varies.svg') },
];

export const REMINDER_STYLE: readonly Option[] = [
  { value: 'gentle', label: 'Suave', icon: require('@/assets/icons/chips/gentle.svg') },
  { value: 'firm', label: 'Firme', icon: require('@/assets/icons/chips/firm.svg') },
  { value: 'persistent', label: 'Insistente', icon: require('@/assets/icons/chips/persistent.svg') },
];

/** El color no lleva icono: la muestra ES la opcion que se esta eligiendo. */
export const ACCENT_COLOR: readonly Option[] = [
  { value: 'forest', label: 'Bosque', swatch: Accents.forest.solid },
  { value: 'olive', label: 'Oliva', swatch: Accents.olive.solid },
  { value: 'leaf', label: 'Hoja', swatch: Accents.leaf.solid },
  { value: 'clay', label: 'Barro', swatch: Accents.clay.solid },
  { value: 'copper', label: 'Cobre', swatch: Accents.copper.solid },
];
