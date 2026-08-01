import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import { Choice } from '@/components/ui/choice';
import { FormError } from '@/components/ui/form-error';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ACCENT_COLOR } from '@/features/auth/options';
import { workspacesApi } from '@/features/workspaces/api';
import { usePressScale } from '@/hooks/use-press-scale';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/**
 * Los iconos que se ofrecen, en el orden en que alguien busca un proyecto.
 *
 * Un subconjunto de los 18 horneados y no todos: `check`, `calendar`, `clock` y `graph-up` son objetos
 * de la app (una tarea hecha, una agenda), no cosas de las que alguien tenga un proyecto. Doce entran
 * en cuatro filas de tres sin scroll, que es lo que hace que elegir sea un vistazo y no una lista.
 *
 * El catalogo REAL vive en el API (`GET /workspaces/catalogs`) y valida los 18; esto es la seleccion
 * que se pinta. Si algun dia hace falta ofrecerlos todos, se pide ahi y se pinta sin desplegar la app.
 */
const ICONS: readonly Icon3DName[] = [
  'work',
  'academic',
  'home',
  'health',
  'money',
  'relationships',
  'creativity',
  'leaf',
  'light',
  'lightning',
  'trophy',
  'moon',
];

/** Lo que la palomita se queda antes de volver. El mismo numero que `new-task`. */
const CONFIRM_MS = 700;

/**
 * Crear un espacio de trabajo. Hoja, como `new-task`, y con las mismas tres reglas:
 * el nombre ES la pantalla, todo lo demas trae default, y se cierra con cruz.
 *
 * Los dos campos con default (icono y color) existen porque un espacio sin ellos no se distinguiria
 * del de al lado en una rejilla de dos columnas — la card se reconoce por forma y color antes de leer
 * el nombre, igual que la fila de una tarea.
 */
export default function NewWorkspaceScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const accent = user?.accentColor;
  const tint = useAccent(accent);
  // Arriba `Space.lg` pelado: la hoja ya nace por debajo de la barra de estado. Ver `new-task`.
  const pad = useScreenPadding(Space.xxl);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<Icon3DName>('work');
  // Arranca en el acento de la persona: es el color que ya eligió para la app.
  const [color, setColor] = useState<AccentName>(accent ?? 'olive');
  // El tinte del color ELEGIDO, que es el de la vista previa y no el de la sesion. Se pide aqui
  // arriba con todos los hooks: dentro del JSX seria una llamada a hook en medio del render.
  const picked = useAccent(color);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  /**
   * El salto vive en un efecto y no dentro de `create`: asi el timer se cancela con la pantalla y un
   * back manual durante la confirmacion no arrastra una navegacion huerfana.
   *
   * `back()` y no `replace('/')`: a diferencia de `new-task`, aqui se puede llegar desde el panel del
   * inicio o desde cualquier sitio que ofrezca crear un espacio, y volver al que te trajo es lo que no
   * miente. El inicio recarga al enfocarse, asi que el espacio nuevo ya sale.
   */
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.back(), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const create = async () => {
    const clean = name.trim();
    if (!token) return;
    if (!clean) return setFields({ name: 'Ponle un nombre' });

    setSaving(true);
    setError('');
    setFields({});
    try {
      await workspacesApi.create(token, { name: clean, icon, accent: color });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.fields.name ? '' : (Object.values(e.fields)[0] ?? e.message));
      } else {
        setError('No pudimos crearlo');
      }
    } finally {
      setSaving(false);
    }
  };

  // Despues de todos los hooks: al cerrar sesion el user se vuelve null y salir antes dejaria a
  // React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Space.lg, paddingBottom: pad.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BackButton close />

          <View style={styles.head}>
            <Micro>Nuevo espacio</Micro>
          </View>

          {/* Sin caja ni etiqueta, como el titulo de `new-task`: es lo unico que la pantalla pide. */}
          <View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="¿De qué es este espacio?"
              placeholderTextColor={t.textMuted}
              selectionColor={tint.ink}
              style={[Type.title, styles.name, { color: t.text }]}
              autoFocus
              maxLength={40}
              submitBehavior="blurAndSubmit"
            />
            <FormError message={fields.name} />
          </View>

          <View style={[styles.rule, { backgroundColor: t.line }]} />

          {/*
            La vista previa: el icono y el color juntos, como se van a ver en la card. Sin esto hay que
            elegir dos cosas a ciegas y descubrir el resultado al volver al inicio.
          */}
          <View style={styles.preview}>
            <View style={[styles.chip, { backgroundColor: picked.soft }]}>
              <Icon3D name={icon} size={Icon3DSize.lg} />
            </View>
          </View>

          <IconChoice value={icon} onChange={setIcon} accent={color} />

          {/* Las etiquetas de color ya existen en `options.ts` y las comparte con el onboarding: dos
              listas de los mismos cinco colores se desincronizan a la primera. */}
          <Choice
            label="Color"
            options={ACCENT_COLOR}
            value={color}
            onChange={(value: AccentName) => setColor(value)}
            accent={color}
          />

          <FormError message={error} />

          <BigButton label="Crear espacio" loading={saving} success={done} onPress={create} accent={color} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * La rejilla de iconos 3D.
 *
 * No usa `Choice` aunque se le parezca: `Choice` pinta un icono de LINEA de Lucide junto a una
 * etiqueta de texto, y aqui el icono ES la opcion — un render 3D de 32pt con la palabra "Trabajo" al
 * lado seria decir lo mismo dos veces, y con doce opciones eso son doce filas en vez de cuatro.
 */
function IconChoice({
  value,
  onChange,
  accent,
}: {
  value: Icon3DName;
  onChange: (icon: Icon3DName) => void;
  accent: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);

  return (
    <View style={styles.icons}>
      <Micro>Icono</Micro>
      <View style={styles.iconGrid}>
        {ICONS.map((name) => {
          const on = name === value;
          return (
            <View
              key={name}
              // El borde vive siempre y solo cambia de color: animar el grosor movia el icono un
              // pixel en cada toque. Es la misma regla que `choice.tsx`.
              style={[
                styles.iconSlot,
                { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
              ]}>
              <IconOption name={name} on={on} onPress={() => onChange(name)} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Aparte para que cada opcion tenga sus propios shared values, como el `Card` de `choice.tsx`. */
function IconOption({ name, on, onPress }: { name: Icon3DName; on: boolean; onPress: () => void }) {
  const press = usePressScale({ to: 0.9 });
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconTouch}>
        <Icon3D name={name} size={Icon3DSize.md} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    gap: Space.xl,
  },
  head: { gap: Space.xs },
  name: { minHeight: Touch.button, paddingTop: Space.sm },
  rule: { height: 1 },
  preview: { alignItems: 'center' },
  chip: {
    width: 88,
    height: 88,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icons: { gap: Space.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  iconSlot: { borderRadius: Radius.md, borderWidth: 2 },
  iconTouch: {
    width: Touch.chip,
    height: Touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
