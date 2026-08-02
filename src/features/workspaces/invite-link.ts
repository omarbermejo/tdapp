import { API_URL } from '@/features/auth/api';

/**
 * El código de invitación, como enlace.
 *
 * Un código de seis caracteres se dicta bien y se teclea mal: hay que abrir la app, encontrar
 * "unirme", y no equivocarse. Un enlace y un QR se tocan una vez.
 *
 * **Es un esquema propio (`tdapp://`) y no una URL universal**, y hay que decir por qué: una URL
 * `https://` solo abre la app si el dominio sirve un `apple-app-site-association` firmado, y hoy el
 * único dominio que hay es el del API en Railway. Con el esquema propio el enlace funciona en cuanto
 * la app está instalada, que es el caso real de alguien a quien invitas.
 *
 * El coste es honesto: sin la app instalada el enlace no hace nada. Por eso `shareText` manda las dos
 * cosas — el enlace para quien la tenga y el código para quien no.
 */
export const inviteLink = (code: string) => `tdapp:///join-workspace?code=${code}`;

/**
 * Lo que va dentro del QR.
 *
 * Es el MISMO enlace, no un formato aparte: un QR que codificara solo el código obligaría a la
 * cámara del sistema a no saber qué hacer con él, y a que la app tuviera dos maneras de leer lo
 * mismo. Así, la cámara de iOS lo reconoce como enlace y abre la app sola.
 */
export const inviteQr = inviteLink;

/**
 * El texto que se comparte. Enlace, código y el nombre del espacio, en ese orden.
 *
 * El nombre va primero porque es lo único que le dice a quien lo recibe DE QUÉ va esto; un mensaje
 * que empieza con un enlace opaco se lee como spam. Y el código va al final y en claro para quien
 * abra el mensaje en un aparato sin la app: sigue pudiendo teclearlo.
 */
export const shareText = (workspace: string, code: string) =>
  `Te invito a "${workspace}" en tdapp.\n\n${inviteLink(code)}\n\nO entra con el código: ${code}`;

/**
 * El código que trae un enlace, o null.
 *
 * Tolera las dos formas en que puede llegar: `tdapp:///join-workspace?code=ABC123` (el enlace) y
 * `ABC123` a secas (alguien pegando el código en el escáner). Normalizar aquí evita que cada sitio
 * que lee un código tenga que acordarse de los dos casos.
 */
export const codeFromLink = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /[?&]code=([^&\s]+)/i.exec(trimmed);
  const code = (match?.[1] ?? trimmed).toUpperCase();
  // Seis caracteres del alfabeto del API. Lo demás no es un código y no vale la pena mandarlo.
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
};

/** Solo para el mensaje de "no tienes la app": el dominio del API es lo único público que hay. */
export const API_HOST = API_URL;
