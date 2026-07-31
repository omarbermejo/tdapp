/**
 * Uno por icono y NO del barril (`from 'lucide-react-native'`): medido contra el bundle, el barril
 * mete 1756 modulos de icono para usar catorce, y Metro no hace tree-shaking de ese re-export.
 * Mismo criterio que la barra de pestañas. Los nombres de mas de una palabra van en kebab-case.
 */
import Banknote from 'lucide-react-native/icons/banknote';
import BellRing from 'lucide-react-native/icons/bell-ring';
import BookOpen from 'lucide-react-native/icons/book-open';
import BriefcaseBusiness from 'lucide-react-native/icons/briefcase-business';
import Feather from 'lucide-react-native/icons/feather';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import House from 'lucide-react-native/icons/house';
import Megaphone from 'lucide-react-native/icons/megaphone';
import Moon from 'lucide-react-native/icons/moon';
import Shuffle from 'lucide-react-native/icons/shuffle';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Sun from 'lucide-react-native/icons/sun';
import Sunrise from 'lucide-react-native/icons/sunrise';
import Users from 'lucide-react-native/icons/users';

import type { Option } from '@/components/ui/choice';

/**
 * Etiquetas en español para los catalogos del backend (GET /auth/catalogs).
 *
 * No hay diagnostico ni tratamiento: son dato clinico que la app no usa y eran las dos
 * preguntas que mas gente dejaba a medias.
 *
 * Los iconos son de Lucide (ISC), los MISMOS glifos que antes vivian como .svg en `assets/` — se
 * cambio el mecanismo, no el dibujo. Como componente, el color sale de los tokens y sigue al
 * esquema solo: antes el trazo venia quemado en el archivo y habia que taparlo con un tinte.
 *
 * No son los stickers de Alteos a proposito: a 26pt dentro de un chip una ilustracion con trama de
 * puntos se vuelve papilla, y el diseño de referencia usa justo iconos de linea en sus controles.
 * Las ilustraciones de Alteos siguen siendo los heroes de pantalla (welcome y el ultimo paso del
 * onboarding), asi que el sistema queda en dos niveles: ilustracion para heroes, linea para
 * controles.
 */
export const FOCUS_AREAS: readonly Option[] = [
  { value: 'study', label: 'Estudio', icon: BookOpen },
  { value: 'work', label: 'Trabajo', icon: BriefcaseBusiness },
  { value: 'home', label: 'Casa', icon: House },
  { value: 'health', label: 'Salud', icon: HeartPulse },
  { value: 'money', label: 'Dinero', icon: Banknote },
  { value: 'relationships', label: 'Relaciones', icon: Users },
  { value: 'creativity', label: 'Creatividad', icon: Sparkles },
];

export const PEAK_ENERGY: readonly Option[] = [
  { value: 'morning', label: 'Mañana', icon: Sunrise },
  { value: 'afternoon', label: 'Tarde', icon: Sun },
  { value: 'night', label: 'Noche', icon: Moon },
  { value: 'varies', label: 'Cambia mucho', icon: Shuffle },
];

export const REMINDER_STYLE: readonly Option[] = [
  { value: 'gentle', label: 'Suave', icon: Feather },
  { value: 'firm', label: 'Firme', icon: Megaphone },
  { value: 'persistent', label: 'Insistente', icon: BellRing },
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
