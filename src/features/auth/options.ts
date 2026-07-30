import type { Option } from '@/components/ui/choice';

/** Etiquetas en español para los catalogos del backend (GET /auth/catalogs). */
export const DIAGNOSIS: readonly Option[] = [
  { value: 'inattentive', label: 'Inatento', emoji: '🌫️' },
  { value: 'hyperactive', label: 'Hiperactivo', emoji: '⚡️' },
  { value: 'combined', label: 'Combinado', emoji: '🌪️' },
  { value: 'evaluating', label: 'En evaluación', emoji: '🔍' },
  { value: 'undiagnosed', label: 'Sin diagnóstico', emoji: '🤔' },
  { value: 'undisclosed', label: 'Prefiero no decir', emoji: '🤐' },
];

export const TREATMENT: readonly Option[] = [
  { value: 'medication', label: 'Medicación', emoji: '💊' },
  { value: 'therapy', label: 'Terapia', emoji: '🗣️' },
  { value: 'both', label: 'Ambos', emoji: '🤝' },
  { value: 'none', label: 'Ninguno', emoji: '🚫' },
  { value: 'undisclosed', label: 'Prefiero no decir', emoji: '🤐' },
];

export const FOCUS_AREAS: readonly Option[] = [
  { value: 'study', label: 'Estudio', emoji: '📚' },
  { value: 'work', label: 'Trabajo', emoji: '💼' },
  { value: 'home', label: 'Casa', emoji: '🏠' },
  { value: 'health', label: 'Salud', emoji: '🫀' },
  { value: 'money', label: 'Dinero', emoji: '💸' },
  { value: 'relationships', label: 'Relaciones', emoji: '💬' },
  { value: 'creativity', label: 'Creatividad', emoji: '🎨' },
];

export const PEAK_ENERGY: readonly Option[] = [
  { value: 'morning', label: 'Mañana', emoji: '🌅' },
  { value: 'afternoon', label: 'Tarde', emoji: '☀️' },
  { value: 'night', label: 'Noche', emoji: '🌙' },
  { value: 'varies', label: 'Cambia mucho', emoji: '🎲' },
];

export const REMINDER_STYLE: readonly Option[] = [
  { value: 'gentle', label: 'Suave', emoji: '🪶' },
  { value: 'firm', label: 'Firme', emoji: '📣' },
  { value: 'persistent', label: 'Insistente', emoji: '🚨' },
];

export const ACCENT_COLOR: readonly Option[] = [
  { value: 'electric', label: 'Eléctrico', emoji: '🟣' },
  { value: 'lime', label: 'Lima', emoji: '🟢' },
  { value: 'mango', label: 'Mango', emoji: '🟠' },
  { value: 'magenta', label: 'Magenta', emoji: '🩷' },
  { value: 'turquoise', label: 'Turquesa', emoji: '🩵' },
];
