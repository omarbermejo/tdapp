import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { FormError } from '@/components/ui/form-error';
import { TimeField } from '@/components/ui/time-field';
import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError, type Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS } from '@/features/auth/options';
import { isoAt, localDate, tasksApi } from '@/features/tasks/api';

import { usePressScale } from '@/hooks/use-press-scale';

/**
 * El unico camino para anotar. El titulo ES la pantalla.
 *
 * Antes eran cuatro grupos de chips apilados en un scroll: el mismo "formulario de siete campos
 * vacios" que el comentario decia querer evitar, solo con chips en vez de inputs. Ahora las tres
 * decisiones viven como pastillas que muestran su valor ACTUAL, y tocarlas abre su selector una
 * a la vez. Se ve una decision o ninguna, nunca cuatro.
 *
 * Las tres ya traen default, asi que escribir el titulo y darle a Crear son dos toques.
 *
 * Antes habia dos: una hoja de captura rapida sobre el home y esta pantalla. La hoja se fue
 * porque pedia lo mismo con menos espacio y su salida ("Con mas detalle") traia aqui de todos
 * modos — dos formas de lo mismo, y la mitad de los caminos acababa escribiendo dos veces.
 *
 * Son cuatro decisiones y ninguna obligatoria mas que el titulo: todo lo demas trae el default
 * que la mayoria elige, porque un formulario de siete campos vacios es donde una tarea se muere.
 */

/** Los minutos son los de sizeMinutes de GET /tasks/catalogs (5/25/50); aqui van en la etiqueta
 *  porque el numero ES la decision y no vale pedir un catalogo para poder pintar tres chips. */
type SizeOption = Option & { short: string };

const SIZES: readonly SizeOption[] = [
  { value: 'quick', label: 'Rápida · 5 min', short: '5 min' },
  { value: 'medium', label: 'Media · 25 min', short: '25 min' },
  { value: 'deep', label: 'Profunda · 50 min', short: '50 min' },
];

/** El foco es opcional, asi que la opcion de no tenerlo tiene que estar a la vista: un chip
 *  de seleccion unica no se puede desmarcar, y sin esto quedabas atrapado en el preseleccionado. */
const FOCUS_OPTIONS: readonly Option[] = [...FOCUS_AREAS, { value: '', label: 'Sin foco' }];

/** Horas en punto, como REMINDER_HOUR: dos toques contra tres ruedas de un picker. */
const HOURS: readonly Option[] = [
  { value: '7', label: '7 am' },
  { value: '9', label: '9 am' },
  { value: '11', label: '11 am' },
  { value: '13', label: '1 pm' },
  { value: '15', label: '3 pm' },
  { value: '17', label: '5 pm' },
  { value: '19', label: '7 pm' },
  { value: '21', label: '9 pm' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * ponytail: tres chips (hoy, mañana y el siguiente) para el 90% de los casos, y un cuarto que
 * revela el campo de fecha para el resto. Los chips son dos toques; el campo son ocho digitos.
 *
 * Los tres dias cerca no son una limitacion tecnica sino la ruta corta: planear a diez dias es
 * justo lo que no funciona con TDAH. Pero el techo duro estorbaba, asi que el DateField ya
 * acepta futuro (mode='future') y "Otro día" escribe el MISMO estado ISO 'YYYY-MM-DD'.
 */
const OTHER = 'other';
/** El chip que revela el campo de hora exacta. */
const OTHER_HOUR = 'other-hour';

/** Cual de los tres selectores esta abierto. Solo uno a la vez, y `null` es el estado normal. */
type Panel = 'when' | 'size' | 'focus' | null;

/**
 * Los chips y el hueco inicial salen de UNA sola lectura del reloj: con dos, cruzar la
 * medianoche entre ellas dejaria el dia elegido sin chip que lo represente.
 *
 * El hueco inicial devuelve dia Y hora juntos porque son una sola decision: si ya no queda
 * hora en punto hoy (a las 22:00 no queda ninguna), el default arranca en mañana con la
 * primera. Elegir la hora por separado es lo que hacia que anotar a las 22:00 con los
 * defaults creara una tarea para HOY a las 07:00, ya vencida.
 */
const initialWhen = () => {
  const now = new Date();
  const days: Option[] = [0, 1, 2].map((n) => {
    const at = new Date(now);
    at.setDate(at.getDate() + n);
    return {
      value: localDate(at),
      label: n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : cap(at.toLocaleDateString('es-MX', { weekday: 'long' })),
    };
  });

  // Estricto: a las 9:30 las 9 am ya pasaron, y un vencimiento en el pasado no sirve de nada.
  const hour = HOURS.find((h) => Number(h.value) > now.getHours());
  return {
    days,
    date: hour ? days[0].value : days[1].value,
    hour: (hour ?? HOURS[0]).value,
  };
};

/** '5 ago' para un dia fuera de los tres chips. Se construye con numeros para no cruzar zonas. */
const parseLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

/** '9 am' desde el valor del chip, para poder resumirlo en la pastilla. */
const hourLabel = (value: string) => HOURS.find((h) => h.value === value)?.label ?? value;

/**
 * Lo que la palomita se queda en pantalla antes de irse al home. Suficiente para leerla como
 * "quedo", corto para no convertir anotar en una espera: crear y desaparecer en el mismo frame
 * se lee como que no paso nada, y dos segundos se leen como que la app se colgo.
 */
const CONFIRM_MS = 700;

/**
 * El unico camino para anotar.
 *
 * Es un push sobre las pestañas (ver `(app)/_layout.tsx`), y de ahi sale gratis lo que antes habia
 * que forzar: al cerrarla el navegador la DESMONTA, asi que la siguiente vez el formulario nace
 * limpio, con el reloj recien leido y el autoFocus del titulo de vuelta. La version anterior era una
 * pestaña —que nunca se desmonta— y habia que vaciarla a mano devolviendo `null` mientras no
 * estuviera enfocada.
 */
export default function NewTaskScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const accent = user?.accentColor;
  const tint = useAccent(accent);

  const [title, setTitle] = useState('');
  const [size, setSize] = useState<Task['size']>('medium');
  // Lo que dijo que le importa al entrar: si eligio focos, el primero ya viene puesto.
  const [focus, setFocus] = useState(() => user?.focusAreas[0] ?? '');
  /**
   * El reloj se lee UNA vez, en el inicializador de useState, nunca en el cuerpo del render:
   * dos renders del mismo estado tienen que dar lo mismo.
   */
  const [when] = useState(initialWhen);
  // null mientras el campo de "Otro día" tenga una fecha incompleta o imposible.
  const [date, setDate] = useState<string | null>(when.date);
  const [hour, setHour] = useState(when.hour);
  const [otherDay, setOtherDay] = useState(false);
  /**
   * La hora exacta se parte en dos como el dia: el modo (que chip esta elegido) y el valor
   * validado. `null` con el modo prendido significa "todavia no es una hora", y es lo que
   * impide crear con basura.
   *
   * Existe porque los chips solo dan horas en punto y `dueAt` es un timestamp completo: la
   * restriccion era de la UI, no del API.
   */
  const [otherHour, setOtherHour] = useState(false);
  const [exactTime, setExactTime] = useState<string | null>(null);
  /** Minutos exactos como texto. Vacio = manda el tamaño, que es lo que el API guarda como null. */
  const [exactMinutes, setExactMinutes] = useState('');

  // Cerrado al entrar: la pantalla arranca en "escribe el titulo" y nada mas.
  const [panel, setPanel] = useState<Panel>(null);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Ya quedo: el boton se queda en la palomita y la pantalla se va sola. */
  const [done, setDone] = useState(false);

  /**
   * El salto al home vive en un efecto y no dentro de `create`: asi el timer se cancela con la
   * pantalla y un back manual durante la confirmacion no arrastra una navegacion huerfana.
   *
   * replace y no back: la tarea recien creada se ve en el home (que recarga al enfocarse), y
   * replace saca "Nueva tarea" del historial — volver atras desde el home ya no regresa al
   * formulario que acabamos de vaciar.
   */
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.replace('/'), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [done]);

  // La pastilla resume el dia: si es uno de los tres chips usa su palabra, y si es "otro dia"
  // la fecha corta. Sin dia valido todavia, lo dice en vez de mentir con un valor viejo.
  const dayLabel =
    when.days.find((d) => d.value === date)?.label ??
    (date ? parseLabel(date) : 'Elige el día');

  // La hora exacta, cuando es valida, manda sobre el chip. Sin ella el chip sigue siendo la hora.
  const timeLabel = otherHour ? (exactTime ?? 'Elige la hora') : hourLabel(hour);
  // Los minutos escritos ganan al tamaño, igual que en el API.
  const durationLabel = exactMinutes
    ? `${exactMinutes} min`
    : (SIZES.find((s) => s.value === size)?.short ?? '');
  /**
   * Se juzga aqui y no solo en el API: el rango es el mismo (1-480) y esperar el viaje de red
   * para enterarte de que 500 no cabe es peor que decirlo mientras escribes.
   */
  const minutesProblem =
    exactMinutes && (Number(exactMinutes) < 1 || Number(exactMinutes) > 480)
      ? 'Entre 1 y 480 minutos'
      : null;

  const pickDay = (value: string) => {
    // "Otro día" no es una fecha: solo revela el campo, que arranca con el dia ya elegido.
    if (value === OTHER) return setOtherDay(true);
    setOtherDay(false);
    setDate(value);
  };

  const create = async () => {
    const clean = title.trim();
    if (!token) return;
    if (!clean) return setFields({ title: 'Escribe qué quieres hacer' });
    if (!date) return setFields({ dueAt: 'Escribe el día completo: DD/MM/AAAA' });
    if (otherHour && !exactTime) return setFields({ dueAt: 'Escribe la hora completa: HH:MM' });
    if (minutesProblem) return setFields({ minutes: minutesProblem });

    setSaving(true);
    setError('');
    setFields({});
    try {
      await tasksApi.create(token, {
        title: clean,
        size,
        // Vacio va como null: es el "no lo decidi" que deja mandar al tamaño.
        minutes: exactMinutes ? Number(exactMinutes) : null,
        focusArea: focus || null,
        // isoAt y no toISOString(): en ISO UTC una tarea de la noche se va al dia siguiente.
        dueAt: isoAt(
          date,
          ...((otherHour && exactTime
            ? exactTime.split(':').map(Number)
            : [Number(hour), 0]) as [number, number])
        ),
      });
      // El teclado se va antes de la palomita: abierto tapa justo el boton que confirma.
      Keyboard.dismiss();
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        // El mensaje general del API es "Revisa los datos enviados": si el detalle ya se lee
        // bajo el titulo, repetirlo es ruido; si el fallo es de un campo sin hueco propio
        // (tamano, foco, fecha), ese texto es lo unico que explica por que no se creo.
        setError(e.fields.title ? '' : (Object.values(e.fields)[0] ?? e.message));
      } else {
        setError('No pudimos crearla');
      }
    } finally {
      setSaving(false);
    }
  };

  // Despues de todos los hooks: al cerrar sesion el user se vuelve null y salir antes dejaria
  // a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}>
        {/* keyboardShouldPersistTaps: con el teclado abierto, tocar un chip lo elige en el
            primer toque en vez de gastarlo en cerrar el teclado. */}
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BackButton />

          <View style={styles.head}>
            <Micro>Nueva tarea</Micro>
          </View>

          {/*
            Sin caja ni etiqueta: es lo unico que la pantalla pide, asi que no necesita que
            nada le diga que es. El tamaño de titular hace que escribir aqui se sienta como
            anotar en una hoja, no como llenar un campo.
          */}
          <View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="¿Qué hay que hacer?"
              placeholderTextColor={t.textMuted}
              selectionColor={tint.ink}
              style={[Type.title, styles.title, { color: t.text }]}
              multiline
              autoFocus
              maxLength={120}
              submitBehavior="blurAndSubmit"
            />
            <FormError message={fields.title} />
          </View>

          <View style={[styles.rule, { backgroundColor: t.line }]} />

          {/*
            Las tres decisiones como resumen. Cada pastilla dice su valor actual, no sus
            opciones: para crear la tarea no hay que abrir ninguna.
          */}
          <View style={styles.pills}>
            <Pill
              label="Cuándo"
              value={`${dayLabel} · ${timeLabel}`}
              active={panel === 'when'}
              accent={accent}
              onPress={() => setPanel(panel === 'when' ? null : 'when')}
            />
            <Pill
              label="Dura"
              value={durationLabel}
              active={panel === 'size'}
              accent={accent}
              onPress={() => setPanel(panel === 'size' ? null : 'size')}
            />
            <Pill
              label="Foco"
              value={FOCUS_OPTIONS.find((f) => f.value === focus)?.label ?? 'Sin foco'}
              active={panel === 'focus'}
              accent={accent}
              onPress={() => setPanel(panel === 'focus' ? null : 'focus')}
            />
          </View>

          {panel === 'when' && (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.panel}>
              <Choice
                label="El día"
                options={[...when.days, { value: OTHER, label: 'Otro día' }]}
                value={date && !otherDay ? date : OTHER}
                onChange={pickDay}
                accent={accent}
              />
              {otherDay && (
                <DateField
                  label="La fecha"
                  mode="future"
                  value={date}
                  onChange={setDate}
                  error={fields.dueAt}
                  accent={accent}
                />
              )}
              <Choice
                label="La hora"
                options={[...HOURS, { value: OTHER_HOUR, label: 'Otra hora' }]}
                value={otherHour ? OTHER_HOUR : hour}
                onChange={(value: string) => {
                  // El chip de hora exacta arranca con la hora que ya estaba elegida: nunca se
                  // pierde lo que la persona habia decidido para pedirle que lo escriba otra vez.
                  if (value === OTHER_HOUR) {
                    setExactTime(`${hour.padStart(2, '0')}:00`);
                    return setOtherHour(true);
                  }
                  setOtherHour(false);
                  setExactTime(null);
                  setHour(value);
                }}
                accent={accent}
              />
              {otherHour && (
                <TimeField
                  label="Hora exacta"
                  value={exactTime}
                  onChange={setExactTime}
                  error={fields.dueAt}
                  accent={accent}
                />
              )}
            </Animated.View>
          )}

          {panel === 'size' && (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.panel}>
              {/* El tamaño es lo que decide cuanto dura el cronometro, no una etiqueta. */}
              <Choice
                label="Tamaño"
                hint="Cuánto va a durar el cronómetro."
                options={SIZES}
                value={size}
                onChange={(value: Task['size']) => {
                  // Elegir un cajon borra los minutos escritos: si no, la pastilla diria una cosa
                  // y el chip marcado otra, y el API se quedaria con los minutos.
                  setExactMinutes('');
                  setSize(value);
                }}
                accent={accent}
              />
              {/*
                El campo va DEBAJO de los tres cajones y vacio por default: los cajones cubren
                el caso normal y esto es la salida para las tareas que no caben en ninguno.
                Vacio significa "que decida el tamaño", que es el null del API.
              */}
              <BigField
                label="O los minutos exactos"
                value={exactMinutes}
                onChangeText={(value) => setExactMinutes(value.replace(/\D/g, ''))}
                placeholder={`${SIZES.find((s) => s.value === size)?.short ?? ''} si lo dejas vacío`}
                keyboardType="number-pad"
                maxLength={3}
                error={minutesProblem ?? fields.minutes}
                accent={accent}
              />
            </Animated.View>
          )}

          {panel === 'focus' && (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.panel}>
              <Choice label="Foco" options={FOCUS_OPTIONS} value={focus} onChange={setFocus} accent={accent} />
            </Animated.View>
          )}

          <FormError message={error} />

          <BigButton
            label="Crear"
            loading={saving}
            success={done}
            onPress={create}
            accent={accent}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Una decision como pastilla: arriba lo que es, abajo lo que vale ahora.
 *
 * Componente aparte porque cada una necesita su propio shared value para el toque, y porque
 * mostrar el VALOR en vez de las opciones es lo que deja la pantalla en tres lineas.
 */
function Pill({
  label,
  value,
  active,
  accent,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  accent?: AccentName;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.96 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: active }}
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.pill,
          { backgroundColor: t.surface, borderColor: t.line },
          active && { backgroundColor: tint.soft, borderColor: tint.ink },
        ]}>
        <Text style={[Type.micro, { color: t.textMuted }]}>{label}</Text>
        <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
          {value}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    // Aire normal al final del scroll. Ya no hace falta el hueco de la cápsula flotante: esta ruta
    // es un push por ENCIMA de las pestañas, así que la cápsula no llega hasta aquí.
    paddingBottom: Space.xxl,
    gap: Space.xl,
  },
  head: { gap: Space.xs },
  // minHeight y no height: el titulo crece a dos lineas sin empujar la pantalla de golpe.
  title: { minHeight: Touch.button, paddingTop: Space.sm, textAlignVertical: 'top' },
  rule: { height: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  pill: {
    minHeight: Touch.chip,
    gap: 2,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  // El dia y la hora son una sola decision: van mas juntos entre si que del resto.
  panel: { gap: Space.lg },
});
