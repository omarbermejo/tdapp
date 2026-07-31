import { Host } from '@expo/ui/swift-ui';
import * as swiftUI from '@expo/ui/swift-ui';
import * as modifiers from '@expo/ui/swift-ui/modifiers';
import { useState, type ReactNode } from 'react';
import * as jsxDevRuntime from 'react/jsx-dev-runtime';
import * as jsxRuntime from 'react/jsx-runtime';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { accentOnDark } from '@/constants/theme';
import { FocusActivity, type FocusActivityProps } from '@/widgets/focus-activity';

/**
 * Banco de pruebas de la Live Activity. Solo desarrollo — no se llega desde ninguna pantalla.
 *
 * Existe porque afinar el layout de una Live Activity a ciegas es imposible: para verla hay que
 * arrancar un bloque, bloquear el telefono y esperar, y cada iteracion cuesta un minuto. Aqui las
 * cuatro secciones se pintan CON EL MISMO codigo (`FocusActivity` devuelve ReactNodes de
 * @expo/ui/swift-ui, y `Host` los monta dentro de la app), sobre negro y a los anchos reales.
 *
 * Va fuera de `(app)` y sin guard de sesion a proposito: se abre con
 * `xcrun simctl openurl booted "tdapp:///la-preview"` sin tener que navegar ni estar logueado.
 *
 * Lo que NO reproduce: el material translucido del sistema, el recorte de la capsula alrededor de
 * la camara y el ancho exacto que iOS le da a cada region de la Isla. Sirve para proporciones,
 * tipografia y color — que es donde se decide si esto se ve bien.
 */

/** Los anchos que iOS da de verdad, medidos en un iPhone 17. */
const W = { banner: 353, island: 371, compact: 116 };

type Layout = Record<string, ReactNode>;

/**
 * `FocusActivity` NO es una funcion aqui: la directiva `'widget'` la sustituye por un STRING con su
 * propio codigo fuente (con el JSX ya compilado a `_jsx(Text, {...})` y los identificadores pelados).
 * Es asi porque el que la ejecuta es otro proceso, y por eso el layout no puede tener closures.
 *
 * Se rearma igual que lo hace la extension (`expo-widgets/bundle/index.ts`): inyectando `@expo/ui` y
 * un runtime de JSX. La unica diferencia es que ahi el runtime es un stub que devuelve objetos
 * planos para el lado nativo, y aqui va el de React de verdad — asi `Host` recibe elementos que
 * puede montar.
 *
 * Se rearma UNA vez, fuera del componente: `new Function` en cada render seria un compilador
 * corriendo cuatro veces por segundo.
 */
const buildLayout = (): ((p: FocusActivityProps, e: { colorScheme: 'dark' }) => Layout) => {
  const scope: Record<string, unknown> = {
    ...swiftUI,
    ...modifiers,
    // Los mismos alias que exporta el stub de la extension: Babel emite `_jsx` en produccion y
    // `_jsxDEV` en desarrollo, y el string hereda el nombre que le toco.
    _jsx: jsxRuntime.jsx,
    _jsxs: jsxRuntime.jsxs,
    _jsxDEV: jsxDevRuntime.jsxDEV,
    _Fragment: jsxRuntime.Fragment,
    _jsxFileName: 'widget',
  };

  // Se pasan como parametros y no por `globalThis`: ensuciar el global con un `Text` que no es el de
  // react-native es justo el tipo de trampa que aparece tres pantallas mas alla.
  const names = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
  const make = new Function(...names, `return (${FocusActivity as unknown as string});`);
  return make(...names.map((k) => scope[k]));
};

const layoutOf = buildLayout();

/** El padding de la tarjeta. Se resta del ancho para proponerle a SwiftUI el ancho real del texto. */
const PAD = 14;

/** Alto de cada hueco. iOS da marcos fijos, asi que el preview tambien. */
const H = { banner: 72, islandRow: 26, bar: 8 };

/**
 * Un hueco de SwiftUI dentro de la app.
 *
 * `colorScheme="dark"` es lo que hace el preview honesto: la Live Activity real siempre se pinta en
 * oscuro, y sin esto el `Host` hereda el esquema de la app — con el telefono en claro, el texto sin
 * color explicito salia NEGRO sobre negro y parecia que la tarea no se estaba pintando.
 *
 * Con `width`, el alto se mide del contenido pero el ancho se IMPONE: es la unica forma de que
 * SwiftUI reparta el espacio como en el banner de verdad. Sin el, `matchContents` mide el ancho del
 * contenido y cualquier `Spacer` deja de significar nada.
 */
function Slot({ children, ...size }: { children: ReactNode; width?: number; height?: number }) {
  // Medidas explicitas y no `matchContents`: es "set once on mount", asi que tras un hot reload se
  // queda con la medida vieja y las tarjetas se superponen. iOS tampoco mide — a cada region le da
  // un marco fijo, asi que fijarlo aqui es ADEMAS mas parecido a lo real.
  return (
    <Host colorScheme="dark" style={size}>
      {children}
    </Host>
  );
}

type Case = { name: string; props: FocusActivityProps };

const base = (over: Partial<FocusActivityProps>): FocusActivityProps => ({
  phase: 'Enfoque',
  resting: false,
  task: '',
  startedAt: 0,
  endsAt: 0,
  pausedAt: 0,
  tint: accentOnDark('olive'),
  done: 0,
  rounds: 4,
  ...over,
});

/**
 * Los casos que de verdad se ven, no uno bonito. El bloque largo con titulo largo y el descanso sin
 * tarea son los dos extremos: si el layout aguanta los dos, aguanta.
 */
const cases = (now: number): Case[] => [
  {
    name: 'Enfoque libre · 25 min',
    props: base({ startedAt: now - 6 * 60_000, endsAt: now + 19 * 60_000 }),
  },
  {
    name: 'Con tarea larga · ciclo a la mitad',
    props: base({
      task: 'Terminar el rediseño de la pantalla de bloqueo',
      startedAt: now - 40 * 60_000,
      endsAt: now + 10 * 60_000,
      done: 2,
    }),
  },
  {
    name: 'Descanso corto',
    props: base({
      phase: 'Descanso corto',
      resting: true,
      startedAt: now - 60_000,
      endsAt: now + 4 * 60_000,
      tint: accentOnDark('clay'),
      done: 1,
    }),
  },
  {
    name: 'En pausa',
    props: base({
      task: 'Revisar el PR',
      startedAt: now - 10 * 60_000,
      endsAt: now + 15 * 60_000,
      pausedAt: now,
      done: 3,
    }),
  },
];

const ENV = { colorScheme: 'dark' as const };

export default function LivePreviewScreen() {
  // El reloj se lee UNA vez: los rangos tienen que ser estables entre renders.
  const [now] = useState(() => Date.now());

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Live Activity · preview</Text>

        {cases(now).map((c) => {
          const layout = layoutOf(c.props, ENV);

          return (
            <View key={c.name} style={styles.case}>
              <Text style={styles.caseName}>{c.name}</Text>

              <Text style={styles.slot}>banner (pantalla de bloqueo)</Text>
              {/* El fondo negro y el radio son los de la tarjeta del sistema, para juzgar el aire. */}
              <View style={[styles.card, { width: W.banner }]}>
                <Slot width={W.banner - PAD * 2} height={H.banner}>{layout.banner}</Slot>
              </View>

              <Text style={styles.slot}>isla expandida</Text>
              <View style={[styles.card, styles.island, { width: W.island }]}>
                <View style={styles.islandTop}>
                  <Slot width={150} height={H.islandRow}>{layout.expandedLeading}</Slot>
                  <Slot width={90} height={H.islandRow}>{layout.expandedTrailing}</Slot>
                </View>
                <Slot width={W.island - PAD * 2} height={H.bar}>{layout.expandedBottom}</Slot>
              </View>

              <Text style={styles.slot}>isla compacta</Text>
              <View style={styles.pill}>
                <Slot width={20} height={H.islandRow}>{layout.compactLeading}</Slot>
                <Slot width={62} height={H.islandRow}>{layout.compactTrailing}</Slot>
              </View>
            </View>
          );
        })}

        <Pressable style={styles.done}>
          <Text style={styles.doneLabel}>fin</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#3a4a5a' },
  content: { padding: 16, gap: 28, alignItems: 'center' },
  title: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  case: { gap: 6, alignItems: 'center' },
  caseName: { color: '#cfe', fontSize: 12, fontWeight: '600' },
  slot: { color: '#9ab', fontSize: 10, marginTop: 6 },
  card: { backgroundColor: '#000', borderRadius: 22, padding: PAD },
  island: { gap: 10 },
  islandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Sin ancho fijo: la capsula compacta la dimensiona iOS con el contenido, asi que aqui tambien
  // crece con el — es la unica forma de VER si un cambio de tamaño la encoge de verdad.
  pill: {
    backgroundColor: '#000',
    borderRadius: 999,
    height: 37,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  done: { height: 40 },
  doneLabel: { color: '#567', fontSize: 10 },
});
