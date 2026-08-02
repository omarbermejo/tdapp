import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Micro } from '@/components/ui/card';
import { Qr } from '@/components/ui/qr';
import { FormError } from '@/components/ui/form-error';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import {
  Motion,
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useShadow,
  useTheme,
  type AccentName,
} from '@/constants/theme';
import { ApiError, type Collaborator, type Invite, type Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvatar } from '@/features/profile/avatar';
import { Avatar3DSize } from '@/components/ui/avatar3d';
import { usePressScale } from '@/hooks/use-press-scale';

import { invitesApi } from './api';
import { useCollaborators } from './use-collaborators';
import { inviteLink, shareText } from './invite-link';

/** El codigo se lee de tres en tres: seis caracteres seguidos se dictan mal por telefono. */
const grouped = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Cuantas tareas han hecho juntos. Cero tambien cuenta: ya compartieron un espacio. */
const together = (tasks: number) =>
  tasks === 0 ? 'Sin tareas juntos' : tasks === 1 ? '1 tarea juntos' : `${tasks} tareas juntos`;

/**
 * El ultimo paso de crear un espacio: con quien.
 *
 * Opera sobre un espacio que YA existe — por eso el alta lo crea al terminar el paso 3. Salir de aqui
 * sin invitar a nadie es una salida valida y no una cancelacion: invitar es opcional, y perder lo que
 * acabas de nombrar por cerrar la pantalla seria el peor final posible.
 *
 * Tres formas de invitar, de menos a mas esfuerzo: tocar a alguien con quien ya trabajaste, compartir
 * el codigo, o teclear un correo. Las tres crean la MISMA invitacion — un codigo de seis caracteres —
 * asi que quien la recibe siempre entra por el mismo sitio.
 */
export function InviteStep({ workspace, accent }: { workspace: Workspace; accent: AccentName }) {
  const { token } = useAuth();
  const t = useTheme();
  const tint = useAccent(accent);
  const { people } = useCollaborators();

  /** El codigo abierto, el que se comparte. Se crea al tocar, no al abrir el paso. */
  const [open, setOpen] = useState<Invite | null>(null);
  const [email, setEmail] = useState('');
  /** A quien ya se invito, por correo o por id: la fila se marca y no se puede invitar dos veces. */
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const invite = async (key: string, to?: { email?: string; personId?: number }) => {
    if (!token) return null;
    setBusy(key);
    setError('');
    setFieldError('');
    try {
      const { invite } = await invitesApi.create(token, workspace.id, to);
      setSent((s) => (s.includes(key) ? s : [...s, key]));
      return invite;
    } catch (e) {
      if (e instanceof ApiError && e.fields.email) setFieldError(e.fields.email);
      else setError(e instanceof ApiError ? e.message : 'No pudimos crear la invitación');
      return null;
    } finally {
      setBusy('');
    }
  };

  /**
   * Compartir usa la hoja del SISTEMA y no el portapapeles.
   *
   * `expo-clipboard` no esta instalado y no hace falta: copiar deja el codigo en un sitio invisible y
   * obliga a ir a buscar a la persona en otra app. La hoja de compartir hace las dos cosas de un tiron
   * —elegir con quien y mandarlo— y no suma una dependencia.
   */
  const share = async () => {
    const code = open ?? (await invite('open'));
    if (!code) return;
    setOpen(code);
    /*
      El mensaje lleva el ENLACE y el codigo, en ese orden y con el nombre del espacio delante.
      El nombre primero porque es lo unico que dice de que va esto — un mensaje que empieza con un
      enlace opaco se lee como spam. Y el codigo al final, en claro, para quien abra el mensaje en un
      aparato sin la app: sigue pudiendo teclearlo.
    */
    await Share.share({ message: shareText(workspace.name, code.code) }).catch(() => {});
  };

  const byEmail = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean) return setFieldError('Escribe un correo');
    if (await invite(clean, { email: clean })) setEmail('');
  };

  return (
    <View style={styles.wrap}>
      {/*
        El codigo es lo primero y es lo que se toca: es la via que funciona sin saber el correo de
        nadie, que es el caso real de "se lo digo por WhatsApp".
      */}
      <CodeCard code={open?.code} accent={accent} loading={busy === 'open'} onPress={share} />

      <View style={styles.field}>
        <BigField
          label="O por correo"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldError('');
          }}
          error={fieldError}
          accent={accent}
          placeholder="nombre@correo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
        />
        {/*
          `!!email.trim()` no es una redundancia: la clave del ocupado ES el correo, y un campo vacio
          da `''`, que es exactamente el valor de reposo de `busy` — sin esto el boton nacia girando
          para siempre. La clave lleva el correo a proposito, para que dos envios seguidos a personas
          distintas no se confundan.
        */}
        <BigButton
          label="Enviar la invitación"
          variant="outline"
          loading={!!email.trim() && busy === email.trim().toLowerCase()}
          onPress={byEmail}
          accent={accent}
        />
      </View>

      {/*
        Solo se pinta con gente dentro: un titulo sobre una lista vacia le cuenta a quien acaba de
        empezar que le falta algo que todavia no puede tener.
      */}
      {!!people?.length && (
        <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.known}>
          <Micro>Personas con las que trabajaste antes</Micro>
          <View style={styles.people}>
            {people.map((person, i) => (
              <PersonRow
                key={person.person.id}
                collaborator={person}
                index={i}
                accent={accent}
                busy={busy === `p${person.person.id}`}
                invited={sent.includes(`p${person.person.id}`)}
                onPress={() => void invite(`p${person.person.id}`, { personId: person.person.id })}
              />
            ))}
          </View>
        </Animated.View>
      )}

      {/*
        El QR, solo cuando ya hay codigo. Antes de generarlo no hay nada que codificar, y un cuadro
        gris de relleno prometeria un escaneo que no existe.

        Codifica el MISMO enlace que se comparte, no el codigo pelado: asi la camara del sistema lo
        reconoce como enlace y abre la app sola, sin que la otra persona tenga que buscar "unirme".
      */}
      {open && (
        <View style={styles.qr}>
          <Qr value={inviteLink(open.code)} size={QR_SIZE} />
          <Text style={[Type.hint, styles.qrHint, { color: t.textMuted }]}>
            O que lo escaneen desde su teléfono.
          </Text>
        </View>
      )}

      <FormError message={error} />

      {/* La cuenta de lo hecho, y nada mas: sin ella no hay forma de saber si el toque sirvio. */}
      {sent.length > 0 && (
        <Text style={[Type.hint, { color: tint.ink }]}>
          {sent.length === 1 ? 'Una invitación enviada.' : `${sent.length} invitaciones enviadas.`}
        </Text>
      )}

      <Text style={[Type.hint, { color: t.textMuted }]}>
        Puedes invitar a más gente después, desde el espacio.
      </Text>
    </View>
  );
}

/**
 * El codigo, en grande, como una tarjeta que se toca para compartir.
 *
 * Antes de generarlo no hay un hueco con guiones: hay la invitacion a generarlo. Un placeholder de
 * seis rayas se lee como un campo que hay que rellenar, y esto es lo contrario — lo escribe la app.
 */
function CodeCard({
  code,
  accent,
  loading,
  onPress,
}: {
  code?: string;
  accent: AccentName;
  loading: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const shadow = useShadow();
  const press = usePressScale({ to: 0.98 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          code ? `Código ${code.split('').join(' ')}. Compartir` : 'Generar un código de invitación'
        }
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.code, { backgroundColor: tint.soft }, shadow]}>
        <Micro>Código de invitación</Micro>
        {code ? (
          // `display` con tracking abierto: son caracteres sueltos que alguien va a dictar, no una
          // palabra — el kerning normal los pega y el 0 y la O ya no se distinguen.
          <Animated.Text
            entering={FadeInDown.duration(Motion.enter)}
            style={[Type.display, styles.digits, { color: t.text }]}>
            {grouped(code)}
          </Animated.Text>
        ) : (
          <Text style={[Type.title, { color: t.textMuted }]}>
            {loading ? 'Generando…' : 'Genera uno'}
          </Text>
        )}
        <Text style={[Type.hint, { color: t.textMuted }]}>
          {code ? 'Toca para compartirlo · Vence en 7 días' : 'Toca y se lo pasas a quien quieras'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Alguien con quien ya trabajaste. Nombre, cara y el espacio donde mas han hecho juntos.
 *
 * No hay correo a la vista y no es un descuido: la lista viaja por `toPublicMember`, que no lo lleva.
 * El toque manda `personId` y el API resuelve el buzon, asi que invitar es un toque y la app nunca
 * llega a saber el correo de un tercero.
 */
function PersonRow({
  collaborator,
  index,
  accent,
  busy,
  invited,
  onPress,
}: {
  collaborator: Collaborator;
  index: number;
  accent: AccentName;
  busy: boolean;
  invited: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.97 });
  const { person, workspace, tasks } = collaborator;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * Motion.step).duration(Motion.enter)}
      style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Invitar a ${person.name}`}
        accessibilityState={{ disabled: invited, busy }}
        disabled={invited || busy}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.person,
          { backgroundColor: invited ? tint.soft : t.surface, borderColor: t.line },
        ]}>
        <ProfileAvatar user={person} size={Avatar3DSize.sm} />
        <View style={styles.personBody}>
          <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
            {person.name}
          </Text>
          {/* El espacio donde mas han colaborado: es lo que hace reconocible a la persona cuando
              hay tres que se llaman igual. */}
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            {workspace.name} · {together(tasks)}
          </Text>
        </View>
        <Icon3D
          name={(invited ? 'check' : workspace.icon) as Icon3DName}
          size={Icon3DSize.sm}
        />
      </Pressable>
    </Animated.View>
  );
}

/**
 * 200pt de lado. Es el minimo con el que la camara de otro telefono engancha a un palmo de
 * distancia: por debajo, los modulos de un QR de version 3 caen a menos de 6pt y el enfoque falla.
 */
const QR_SIZE = 200;

const styles = StyleSheet.create({
  qr: { alignItems: 'center', gap: Space.sm },
  qrHint: { textAlign: 'center' },
  wrap: { gap: Space.xl },
  code: {
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.sm,
    alignItems: 'center',
  },
  digits: { letterSpacing: 6 },
  field: { gap: Space.md },
  known: { gap: Space.sm },
  people: { gap: Space.sm },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: Touch.chip,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  personBody: { flex: 1, gap: 2 },
});
