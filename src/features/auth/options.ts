import type { Option } from '@/components/ui/choice';
import { Accents } from '@/constants/theme';

/**
 * Etiquetas en español para los catalogos del backend (GET /auth/catalogs).
 *
 * No hay diagnostico ni tratamiento: son dato clinico que la app no usa y eran las dos
 * preguntas que mas gente dejaba a medias.
 *
 * ponytail: los chips van sin icono TODAVIA. Ya estan recoloreados en
 * assets/stickers/chips/ los de study, work, varies, gentle y firm, pero faltan 9 y el plan
 * Starter de Figma solo permite 6 lecturas del MCP al mes, agotadas. Mezclar dos chips con
 * sticker y cinco sin el dentro del mismo grupo se ve roto, asi que entran los 14 juntos o
 * ninguno. Para prenderlos: agregar `icon: require('@/assets/stickers/chips/<value>.svg')`
 * a cada opcion; Choice ya lo soporta.
 */
export const FOCUS_AREAS: readonly Option[] = [
  { value: 'study', label: 'Estudio' },
  { value: 'work', label: 'Trabajo' },
  { value: 'home', label: 'Casa' },
  { value: 'health', label: 'Salud' },
  { value: 'money', label: 'Dinero' },
  { value: 'relationships', label: 'Relaciones' },
  { value: 'creativity', label: 'Creatividad' },
];

export const PEAK_ENERGY: readonly Option[] = [
  { value: 'morning', label: 'Mañana' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'night', label: 'Noche' },
  { value: 'varies', label: 'Cambia mucho' },
];

export const REMINDER_STYLE: readonly Option[] = [
  { value: 'gentle', label: 'Suave' },
  { value: 'firm', label: 'Firme' },
  { value: 'persistent', label: 'Insistente' },
];

/** El color no lleva icono: la muestra ES la opcion que se esta eligiendo. */
export const ACCENT_COLOR: readonly Option[] = [
  { value: 'forest', label: 'Bosque', swatch: Accents.forest.solid },
  { value: 'olive', label: 'Oliva', swatch: Accents.olive.solid },
  { value: 'leaf', label: 'Hoja', swatch: Accents.leaf.solid },
  { value: 'clay', label: 'Barro', swatch: Accents.clay.solid },
  { value: 'copper', label: 'Cobre', swatch: Accents.copper.solid },
];
