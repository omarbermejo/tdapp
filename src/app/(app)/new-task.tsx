import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { FormError } from '@/components/ui/form-error';
import { Space, Type, useTheme } from '@/constants/theme';
import { ApiError, type Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS } from '@/features/auth/options';
import { isoAt, localDate, tasksApi } from '@/features/tasks/api';

import { TAB_DOCK } from './_layout';

/**
 * El camino deliberado.
 *
 * La captura rapida (features/tasks/capture) existe para no perder la idea: un campo y ya.
 * Esta pantalla es la otra mitad, para cuando SI quieres decidir. Son cuatro decisiones y
 * ninguna obligatoria mas que el titulo: todo lo demas trae el default que la mayoria elige,
 * porque un formulario de siete campos vacios es donde una tarea se muere.
 */

/** Los minutos son los de sizeMinutes de GET /tasks/catalogs (5/25/50); aqui van en la etiqueta
 *  porque el numero ES la decision y no vale pedir un catalogo para poder pintar tres chips. */
const SIZES: readonly Option[] = [
  { value: 'quick', label: 'Rápida · 5 min' },
  { value: 'medium', label: 'Media · 25 min' },
  { value: 'deep', label: 'Profunda · 50 min' },
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

export default function NewTaskScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const accent = user?.accentColor;

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

  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

    setSaving(true);
    setError('');
    setFields({});
    try {
      await tasksApi.create(token, {
        title: clean,
        size,
        focusArea: focus || null,
        // isoAt y no toISOString(): en ISO UTC una tarea de la noche se va al dia siguiente.
        dueAt: isoAt(date, Number(hour)),
      });
      router.back();
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
            <Text style={[Type.display, { color: t.text }]} numberOfLines={2}>
              ¿Qué quieres hacer?
            </Text>
          </View>

          <BigField
            label="La tarea"
            value={title}
            onChangeText={setTitle}
            error={fields.title}
            accent={accent}
            autoFocus
            placeholder="Escríbelo como lo dirías"
            maxLength={120}
            returnKeyType="done"
          />

          {/* El tamaño es lo que decide cuanto dura el cronometro, no una etiqueta. */}
          <Choice
            label="Tamaño"
            hint="Cuánto va a durar el cronómetro."
            options={SIZES}
            value={size}
            onChange={setSize}
            accent={accent}
          />

          <Choice label="Foco" options={FOCUS_OPTIONS} value={focus} onChange={setFocus} accent={accent} />

          <View style={styles.when}>
            <Choice
              label="Cuándo"
              options={[...when.days, { value: OTHER, label: 'Otro día' }]}
              value={date && !otherDay ? date : OTHER}
              onChange={pickDay}
              accent={accent}
            />
            {otherDay && (
              <DateField
                label="El día"
                mode="future"
                value={date}
                onChange={setDate}
                error={fields.dueAt}
                accent={accent}
              />
            )}
            <Choice options={HOURS} value={hour} onChange={setHour} accent={accent} />
          </View>

          <FormError message={error} />

          <BigButton label="Crear" loading={saving} onPress={create} accent={accent} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    // La pastilla flotante del grupo (app) pasa por encima aunque esta ruta no sea pestaña.
    paddingBottom: TAB_DOCK,
    gap: Space.xl,
  },
  head: { gap: Space.xs },
  // El dia y la hora son una sola decision: van mas juntos entre si que del resto.
  when: { gap: Space.sm },
});
