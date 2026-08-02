import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { FormError } from '@/components/ui/form-error';
import { Pill } from '@/components/ui/pill';
import { Motion, Space, Type, useTheme } from '@/constants/theme';
import { ApiError, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import {
  FOCUS_AREAS,
  PEAK_ENERGY,
  REMINDER_HOUR,
  REMINDER_STYLE,
} from '@/features/auth/options';

/**
 * Lo que la app SABE de ti, aquí para corregirlo.
 *
 * Vivía en "Editar perfil" y se mudó a Ajustes, con el color quedándose atrás. El corte no es
 * arbitrario: estos cuatro campos dicen cómo se COMPORTA la app —a qué hora te escribe, qué franja
 * marca en tu día, cómo ordena tus tareas— y eso es un ajuste. El color dice cómo se VE, igual que
 * la cara, y por eso los dos viven juntos en la otra pantalla. Además son la misma decisión física:
 * el respaldo del avatar se pinta con `accent.soft`, así que elegir color repinta la rejilla de
 * caras que tienes delante.
 *
 * El perfil decía "Lo que nos contaste al empezar" como si fuera piedra, cuando el API lleva desde el
 * primer día mergeando por campo. Cada dato es ahora una pastilla que dice su valor y abre su panel.
 *
 * **Una sola abierta a la vez.** Es el patrón que `new-task` ya resolvió para el mismo problema, con su
 * propio argumento: se ve una decisión o ninguna, nunca cinco. Con cinco paneles abiertos esto sería
 * otra vez el formulario de siete campos vacíos que la app entera evita.
 *
 * **No hay hoja ni ruta aparte.** Una hoja con su propio "Guardar" tendría que mostrar el color en
 * vivo, y entonces mentiría: eliges Cobre, la hoja se repinta, arrastras hacia abajo —el gesto que la
 * hoja misma invita a hacer— y no se guardó nada. Un panel en línea no puede mentir porque no hay
 * borrador que descartar.
 */
type Panel = 'aviso' | 'energia' | 'focos' | 'naciste' | null;

/** Cuánto se queda la palomita antes de cerrar el panel. Lo justo para verla, no para esperarla. */
const CONFIRM_MS = 700;

const MAX_FOCUS = 3;

/**
 * Cómo entra y cómo se va un panel.
 *
 * Están aquí arriba porque son CINCO paneles: con la pareja repetida en cada uno, el día que la
 * salida cambie quedarán tres iguales y dos distintos, que es exactamente el tipo de incoherencia
 * que no se ve en el diff y sí en la pantalla.
 *
 * **El `exiting` se fue, y no es un descuido.** Iba sincronizado con el `LinearTransition` de `Card`:
 * la tarjeta encogía en 220ms mientras el panel se desvanecía en 160, así que el panel siempre estaba
 * DENTRO de la caja. Al apagar el reacomodo (`RESHAPE`), la tarjeta encoge en un frame — y un panel
 * que tardara 160ms en irse quedaría dibujado FUERA de ella, flotando sobre la sección siguiente,
 * porque `Card` no recorta (`overflow: hidden` se comería sus sombras).
 *
 * El `entering` se queda: eso aparece dentro de una caja que ya creció.
 */
const IN = FadeInDown.duration(Motion.enter);

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/** El icono del catálogo, para que la pastilla enseñe la misma marca que el chip elegido. */
const iconOf = (options: readonly Option[], value: string) =>
  options.find((option) => option.value === value)?.icon;

/** '22 ago 1995'. Corto a propósito: en la pastilla, "22 de agosto de 1995" se elide. */
const birthLabel = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Sin fecha';

const focusLabel = (areas: string[]) =>
  areas.length ? areas.map((area) => labelOf(FOCUS_AREAS, area)).join(' · ') : 'Todavía sin focos';

export function ProfileFields({ user }: { user: User }) {
  const t = useTheme();
  const { updateProfile } = useAuth();
  const accent = user.accentColor;

  /** Cerrado al entrar: la tarjeta arranca en "esto es lo que sé" y nada más. */
  const [panel, setPanel] = useState<Panel>(null);
  const [problem, setProblem] = useState('');
  /** Sube uno por cada guardado con botón que salió bien; es lo que dispara el cierre del panel. */
  const [saved, setSaved] = useState(0);

  /**
   * Los dos paneles con botón llevan su propio estado, nacido al montar.
   *
   * Es obligatorio y no comodidad: `DateField` emite `onChange(null)` en cada edición incompleta, y un
   * `birthDate: null` BORRA la fecha en el servidor. Guardar al toque ahí destruiría el dato mientras
   * lo escribes. Y de paso resuelve que el `DateField` no se resincroniza con su prop.
   */
  const [focus, setFocus] = useState(user.focusAreas);
  const [birth, setBirth] = useState(user.birthDate);

  const open = (which: Panel) => {
    setProblem('');
    // Al abrir, los borradores se reanclan a lo que hay guardado: un panel no arrastra un intento viejo.
    if (which === 'focos') setFocus(user.focusAreas);
    if (which === 'naciste') setBirth(user.birthDate);
    setPanel(panel === which ? null : which);
  };

  /**
   * Guarda y deja el error a la vista si falla.
   *
   * El panel NO se cierra al guardar por toque: cerrarlo desmontaría el `FormError` que iba a explicar
   * un fallo que llega después. Se cierra tocando otra vez la pastilla.
   */
  const save = async (patch: Parameters<typeof updateProfile>[0]) => {
    setProblem('');
    try {
      await updateProfile(patch);
      return true;
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'No se guardó. Se quedó como estaba.');
      return false;
    }
  };

  /** Los dos con botón sí cierran, y por efecto: ver el comentario de abajo. */
  const confirm = async (patch: Parameters<typeof updateProfile>[0]) => {
    if (await save(patch)) setSaved((previous) => previous + 1);
  };

  /**
   * El cierre va en un EFECTO y no en el handler del botón.
   *
   * Un `setTimeout` dentro del press se queda huérfano si la pantalla se va, y sobre todo: al
   * desmontarse el panel se desmonta el `BigButton`, que es lo que limpia su estado de éxito. Sin eso,
   * en una pestaña que nunca se desmonta el botón se quedaría con la palomita puesta para siempre.
   */
  useEffect(() => {
    if (saved === 0) return;
    const id = setTimeout(() => setPanel(null), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [saved]);

  return (
    <Card>
      <Micro>Lo que sé de ti</Micro>
      <Text style={[Type.hint, { color: t.textMuted }]}>Toca lo que ya no aplique.</Text>

      <View style={styles.pills}>
        {/*
          Cada pastilla lleva el icono de SU valor, no uno fijo de la categoría: el sol bajando de
          "Tarde", el megáfono de "Firme". Son los mismos SVG de Lucide que el chip del panel, así que
          la marca que elegiste es la que queda a la vista. Sin assets nuevos.
        */}
        <Pill
          label="Aviso"
          value={`${labelOf(REMINDER_STYLE, user.reminderStyle)} · ${labelOf(REMINDER_HOUR, String(user.reminderHour))}`}
          active={panel === 'aviso'}
          accent={accent}
          bg="sunken"
          // El del estilo y no el de la hora: las horas son presets sin icono, y el estilo es lo
          // que de verdad cambia cómo se siente el aviso.
          icon={iconOf(REMINDER_STYLE, user.reminderStyle)}
          onPress={() => open('aviso')}
        />
        <Pill
          label="Rindes mejor"
          value={labelOf(PEAK_ENERGY, user.peakEnergy)}
          active={panel === 'energia'}
          accent={accent}
          bg="sunken"
          icon={iconOf(PEAK_ENERGY, user.peakEnergy)}
          onPress={() => open('energia')}
        />
        <Pill
          label="Focos"
          value={focusLabel(user.focusAreas)}
          active={panel === 'focos'}
          accent={accent}
          bg="sunken"
          wide
          // El del PRIMERO, y solo uno: tres iconos en fila delante de "Estudio · Salud · Dinero"
          // duplican la enumeración que el texto ya hace y empujan el valor a la segunda línea.
          icon={iconOf(FOCUS_AREAS, user.focusAreas[0] ?? '')}
          onPress={() => open('focos')}
        />
        {/* La única sin marca: el catálogo de fechas no existe, y dibujarle un icono genérico de
            calendario sería el único de la tarjeta que no dice nada sobre su valor. */}
        <Pill
          label="Naciste"
          value={birthLabel(user.birthDate)}
          active={panel === 'naciste'}
          accent={accent}
          bg="sunken"
          onPress={() => open('naciste')}
        />
      </View>

      {/*
        Los tres catálogos cerrados guardan AL TOQUE: no hay estado intermedio inválido, así que un
        botón "Guardar" solo añadiría un paso. La confirmación es la repintada de la app.
      */}
      {panel === 'aviso' && (
        <Animated.View entering={IN} style={styles.panel}>
          <Choice
            label="Cómo te aviso"
            options={REMINDER_STYLE}
            value={user.reminderStyle}
            onChange={(value: string) => save({ reminderStyle: value })}
            accent={accent}
          />
          <Choice
            label="A qué hora"
            options={REMINDER_HOUR}
            value={String(user.reminderHour)}
            // Number y no el string del chip: el API exige un entero 0..23.
            onChange={(value: string) => save({ reminderHour: Number(value) })}
            accent={accent}
          />
        </Animated.View>
      )}

      {panel === 'energia' && (
        <Animated.View entering={IN} style={styles.panel}>
          <Choice
            label="Cuándo rindes mejor"
            hint="Marcamos esa franja en tu calendario."
            options={PEAK_ENERGY}
            value={user.peakEnergy}
            onChange={(value: string) => save({ peakEnergy: value })}
            accent={accent}
          />
        </Animated.View>
      )}

      {panel === 'focos' && (
        <Animated.View entering={IN} style={styles.panel}>
          <Choice
            label="Focos"
            hint={`Hasta ${MAX_FOCUS}. Menos focos, más resultados.`}
            options={FOCUS_AREAS}
            value={focus}
            /**
             * `max` NO se le pasa a `Choice` a propósito: al pasarse del tope, el componente ignora el
             * toque en silencio — sin háptico y sin mensaje — y un control que no responde se lee como
             * roto. Aquí el cuarto se rechaza con una frase que dice qué hacer.
             */
            onChange={(next: string[]) => {
              if (next.length > MAX_FOCUS) {
                setProblem('Ya son tres. Quita uno para cambiarlo.');
                return;
              }
              setProblem('');
              setFocus(next);
            }}
            accent={accent}
          />
          {/* El único botón sólido de la pantalla, y solo cuando hay algo que confirmar. */}
          <BigButton
            label="Guardar"
            accent={accent}
            onPress={() => {
              // El botón nunca se apaga: explica en vez de bloquear.
              if (!focus.length) return setProblem('Elige al menos uno para seguir.');
              confirm({ focusAreas: focus });
            }}
          />
        </Animated.View>
      )}

      {panel === 'naciste' && (
        <Animated.View entering={IN} style={styles.panel}>
          <DateField label="Día, mes y año" value={birth} onChange={setBirth} accent={accent} />
          <BigButton
            label="Guardar"
            accent={accent}
            onPress={() => {
              // `null` con el campo a medias borraría la fecha en el servidor.
              if (!birth) return setProblem('Escribe el día completo: DD/MM/AAAA');
              confirm({ birthDate: birth });
            }}
          />
        </Animated.View>
      )}

      <FormError message={problem} />
    </Card>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  panel: { gap: Space.lg },
});
