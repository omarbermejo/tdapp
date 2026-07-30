import type { Option } from '@/components/ui/choice';

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

/**
 * Horas para el recordatorio diario. Presets y no un picker: son dos toques contra tres
 * ruedas, y una hora en punto cubre el caso real de "avisame en la manana".
 *
 * El valor va como texto porque Choice trabaja con strings; quien guarda lo pasa a numero,
 * que es lo que valida el API (0..23).
 */
export const REMINDER_HOUR: readonly Option[] = [
  { value: '6', label: '6 am' },
  { value: '7', label: '7 am' },
  { value: '8', label: '8 am' },
  { value: '9', label: '9 am' },
  { value: '13', label: '1 pm' },
  { value: '18', label: '6 pm' },
  { value: '20', label: '8 pm' },
  { value: '21', label: '9 pm' },
];

/**
 * El color no lleva icono: la muestra ES la opcion que se esta eligiendo.
 * `swatch` guarda el NOMBRE del acento y no el hex, porque el hex depende del esquema
 * y este modulo se evalua una sola vez al cargar.
 */
export const ACCENT_COLOR: readonly Option[] = [
  { value: 'forest', label: 'Bosque', swatch: 'forest' },
  { value: 'olive', label: 'Oliva', swatch: 'olive' },
  { value: 'leaf', label: 'Hoja', swatch: 'leaf' },
  { value: 'clay', label: 'Barro', swatch: 'clay' },
  { value: 'copper', label: 'Cobre', swatch: 'copper' },
];
