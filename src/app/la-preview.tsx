import { Host } from '@expo/ui/swift-ui';
import * as swiftUI from '@expo/ui/swift-ui';
import * as modifiers from '@expo/ui/swift-ui/modifiers';
import { frame } from '@expo/ui/swift-ui/modifiers';
import type { LiveActivityEnvironment, LiveActivityLayout } from 'expo-widgets';
import { useState, type ReactNode } from 'react';
import * as jsxDevRuntime from 'react/jsx-dev-runtime';
import * as jsxRuntime from 'react/jsx-runtime';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Micro } from '@/components/ui/card';
import { Palette, Radius, Space, Type, accentOnDark, useTheme } from '@/constants/theme';
import { useScreenPadding } from '@/hooks/use-screen-padding';
import { FocusActivity, type FocusActivityProps } from '@/widgets/focus-activity';

/**
 * Banco de pruebas de la Live Activity. Solo desarrollo — no se llega desde ninguna pantalla.
 *
 * Existe porque afinar la Isla Dinamica a ciegas es imposible: para verla hay que arrancar un bloque,
 * bloquear el telefono, esperar a que la capsula se abra, y cada iteracion cuesta un minuto. Aqui las
 * CUATRO presentaciones se pintan con el MISMO codigo que corre en la extension (`FocusActivity`
 * devuelve nodos de @expo/ui/swift-ui y `Host` los monta dentro de la app), sobre negro y a los
 * anchos que iOS da de verdad.
 *
 * Va fuera de `(app)` y sin guard de sesion a proposito: se abre con
 * `xcrun simctl openurl booted "tdapp:///la-preview"` sin navegar ni estar logueado.
 *
 * Lo que NO reproduce: el material translucido del sistema, el recorte real de la capsula alrededor
 * de la camara y el ancho exacto que iOS le da a cada region. Sirve para proporciones, tipografia,
 * color y —sobre todo— para ver QUE SE RECORTA, que es donde se rompia el diseño.
 */

/**
 * `FocusActivity` NO es una funcion aqui: el directive `'widget'` la sustituye por un STRING con su
 * propio codigo fuente (con el JSX ya compilado a `_jsx(Text, {...})`). Es asi porque quien la
 * ejecuta es otro proceso, y por eso el layout no puede capturar nada de fuera.
 *
 * Se rearma igual que lo hace la extension (`expo-widgets/bundle/index.ts`): inyectando @expo/ui y
 * un runtime de JSX. La unica diferencia es que ahi el runtime es un stub que devuelve objetos planos
 * para el lado nativo, y aqui va el de React de verdad — asi `Host` recibe elementos que puede montar.
 *
 * Se rearma UNA vez, fuera del componente: `new Function` en cada render seria un compilador
 * corriendo cada vez que cambias de caso.
 */
const buildLayout = (): ((p: FocusActivityProps, e: LiveActivityEnvironment) => LiveActivityLayout) => {
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

/**
 * La geometria de la Isla, medida en un iPhone 17. Es lo que hace que esto sirva de algo: con anchos
 * inventados el layout siempre cabe, y lo que hay que ver aqui es justo lo que NO cabe.
 *
 * `lens` es el hueco de la camara y los sensores. Es el numero que faltaba en la version anterior de
 * este banco —tenia 22pt de separacion— y por eso la compacta se veia comoda aqui y apretada en el
 * telefono: entre el icono y el reloj hay casi cien puntos de nada.
 */
const ISLAND = {
  /** La expandida y el banner. El telefono mide 393, asi que la expandida deja 11pt por lado. */
  expanded: 371,
  banner: 353,
  /** La capsula en reposo: 122×37 en todos los Pro desde el 14. El radio es la mitad del alto. */
  pill: 37,
  /** Radio de la expandida: la curva continua de Apple, mucho mas redonda que una tarjeta. */
  radius: 44,
  /**
   * El de la tarjeta del banner, que es mucho menos: 23.5 dice el log del sistema
   * (`rawListItem cornerRadius`). Importa porque es la curva que se come el rotulo si el layout no
   * mete sangria — con `Radius.xl` (32) el banco exageraba el problema.
   */
  bannerRadius: 23.5,
  lens: 96,
  /** El aire interno de la expandida y del banner. */
  pad: 14,
};

/**
 * El marco que iOS le da a cada region. Alto FIJO y no medido: el sistema tampoco mide — a cada
 * region le da su marco y ahi dentro te acomodas.
 */
const SLOT = {
  compactLeading: 24,
  compactTrailing: 58,
  /** La minima es un circulo. El glifo vive centrado dentro de la capsula de 37. */
  minimal: 24,
  expandedLeading: 145,
  expandedTrailing: 100,
  /** Alto de la fila de arriba de la expandida y de la capsula compacta. */
  row: 26,
  /**
   * La banda de abajo de la expandida.
   *
   * 24 y no 8: `ProgressView(timerInterval:)` pinta su PROPIA cuenta atras debajo de la barra, y el
   * layout la apaga con un foreground transparente porque @expo/ui no expone el init que la quita.
   * Sigue ocupando su linea, asi que la region mide barra + etiqueta invisible. Se reserva de verdad
   * para que aqui se vea el alto que la isla ocupa en el telefono y no una version mentirosa.
   */
  bar: 24,
  /**
   * El banner incluye ya su propio aire (el layout se lo mete a cada fila), asi que aqui va el alto
   * COMPLETO de la tarjeta: ~81pt medidos en la pantalla de bloqueo del simulador.
   */
  banner: 82,
};

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
 * Los casos que de verdad se ven, no uno bonito. Los extremos son el titulo largo y el 'Descanso
 * largo' sin tarea: si el layout aguanta esos dos, aguanta.
 */
const cases = (now: number): Case[] => [
  {
    name: 'Enfoque libre',
    props: base({ startedAt: now - 6 * 60_000, endsAt: now + 19 * 60_000 }),
  },
  {
    name: 'Tarea larga',
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
    name: 'Descanso largo',
    props: base({
      phase: 'Descanso largo',
      resting: true,
      startedAt: now - 2 * 60_000,
      endsAt: now + 13 * 60_000,
      tint: accentOnDark('clay'),
      done: 4,
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

/**
 * La Live Activity SIEMPRE se pinta en oscuro, en los dos esquemas del sistema. Es lo mismo que
 * recibe la extension, y por eso el color del acento llega ya resuelto en los props.
 */
const ENV: LiveActivityEnvironment = { colorScheme: 'dark' };

/**
 * Un hueco de SwiftUI dentro de la app.
 *
 * `colorScheme="dark"` es lo que hace el preview honesto: sin esto el `Host` hereda el esquema de la
 * app y, con el telefono en claro, el texto sin color explicito salia NEGRO sobre negro.
 *
 * Con `width` el ancho se IMPONE, que es la unica forma de que SwiftUI reparta el espacio como en el
 * telefono: sin el, cualquier `Spacer` deja de significar nada.
 *
 * `Host` ancla su contenido ARRIBA a la izquierda (un ZStack con `.topLeading`), y las regiones de la
 * Isla no: centran verticalmente y la trailing pega al canto derecho. De ahi el `align` — es la
 * diferencia entre juzgar el diseño y juzgar el ancla del banco de pruebas. El banner si se queda sin
 * el: ahi el contenido cae desde arriba, igual que en la tarjeta del sistema.
 */
function Slot({
  children,
  width,
  height,
  align,
}: {
  children: ReactNode;
  width: number;
  height: number;
  align?: 'leading' | 'trailing' | 'center';
}) {
  return (
    <Host
      colorScheme="dark"
      style={{ width, height }}
      modifiers={align ? [frame({ maxWidth: width, maxHeight: height, alignment: align })] : undefined}>
      {children}
    </Host>
  );
}

/** El hueco de la camara. El circulo es el lente: sirve para ver cuanto se le acerca el contenido. */
const Lens = () => (
  <View style={styles.lens}>
    <View style={styles.eye} />
  </View>
);

export default function LivePreviewScreen() {
  const t = useTheme();
  const pad = useScreenPadding(Space.xxl);
  // El reloj se lee UNA vez: los rangos tienen que ser estables entre renders.
  const [now] = useState(() => Date.now());
  const [pick, setPick] = useState(0);

  const all = cases(now);
  const current = all[pick] ?? all[0];
  const layout = layoutOf(current.props, ENV);

  return (
    <ScrollView
      style={{ backgroundColor: t.canvas }}
      contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <Text style={[Type.title, { color: t.text }]}>Isla Dinámica</Text>
        <Text style={[Type.hint, { color: t.textMuted }]}>
          Las cuatro presentaciones con el mismo layout que pinta iOS, a los anchos reales.
        </Text>
      </View>

      {/* Un caso a la vez: lo que se compara aqui son las presentaciones entre si, no los casos. */}
      <View style={styles.picker}>
        {all.map((c, i) => (
          <Pressable
            key={c.name}
            onPress={() => setPick(i)}
            style={[
              styles.chip,
              { backgroundColor: i === pick ? t.ink : t.sunken },
            ]}>
            <Text style={[Type.hint, { color: i === pick ? t.onInk : t.textMuted }]}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.label}>
          <Micro>Compacta · con la app cerrada</Micro>
        </View>
        <View style={styles.wall}>
          <View style={styles.pill}>
            <Slot width={SLOT.compactLeading} height={SLOT.row} align="leading">
              {layout.compactLeading}
            </Slot>
            <Lens />
            <Slot width={SLOT.compactTrailing} height={SLOT.row} align="trailing">
              {layout.compactTrailing}
            </Slot>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.label}>
          <Micro>Mínima · con otra actividad al lado</Micro>
        </View>
        <View style={styles.wall}>
          <View style={styles.minimalRow}>
            {/* La capsula de la OTRA actividad, que es lo que empuja la nuestra al circulo. */}
            <View style={styles.other}>
              <Lens />
            </View>
            <View style={styles.dot}>
              <Slot width={SLOT.minimal} height={SLOT.minimal} align="center">
                {layout.minimal}
              </Slot>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.label}>
          <Micro>Expandida · al tocarla</Micro>
        </View>
        <View style={styles.wall}>
          <View style={styles.expanded}>
            <View style={styles.top}>
              <Slot width={SLOT.expandedLeading} height={SLOT.row} align="leading">
                {layout.expandedLeading}
              </Slot>
              <Lens />
              <Slot width={SLOT.expandedTrailing} height={SLOT.row} align="trailing">
                {layout.expandedTrailing}
              </Slot>
            </View>
            <Slot width={ISLAND.expanded - ISLAND.pad * 2} height={SLOT.bar}>
              {layout.expandedBottom}
            </Slot>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.label}>
          <Micro>Banner · pantalla de bloqueo</Micro>
        </View>
        <View style={styles.wall}>
          <View style={styles.banner}>
            {/*
              El banner va a RAS de la tarjeta, sin padding del hueco: el sistema no le mete margen
              propio —verificado en la pantalla de bloqueo del simulador, donde el rotulo aparecia
              cortado por la esquina— asi que la sangria la pone el layout en cada fila. Restarle aqui
              otro margen mostraria el doble de aire que en el telefono.
            */}
            <Slot width={ISLAND.banner} height={SLOT.banner}>
              {layout.banner}
            </Slot>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Sin padding horizontal: la expandida mide 371 y el contenido de una pantalla con aire a los
  // lados la recortaria. Cada banda es de ancho completo y centra su capsula, igual que el telefono.
  content: { gap: Space.xl },
  head: { paddingHorizontal: Space.xl, gap: Space.xs },
  label: { paddingHorizontal: Space.xl },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, paddingHorizontal: Space.xl },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  section: { gap: Space.sm },
  /**
   * El fondo de pantalla. No es decoracion: la Isla es negra y el banner casi, asi que sobre el papel
   * de la app —blanco o negro— no se distinguen sus bordes. Un tono medio de la marca es lo que deja
   * ver donde acaba la capsula, que es la mitad de lo que se juzga aqui.
   */
  wall: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    backgroundColor: Palette.oliveLeaf[600],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ISLAND.pill,
    borderRadius: ISLAND.pill / 2,
    paddingHorizontal: Space.md,
    backgroundColor: Palette.carbon[0],
  },
  minimalRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ISLAND.pill,
    width: 122,
    borderRadius: ISLAND.pill / 2,
    backgroundColor: Palette.carbon[0],
  },
  dot: {
    height: ISLAND.pill,
    width: ISLAND.pill,
    borderRadius: ISLAND.pill / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.carbon[0],
  },
  /**
   * El aire vertical es MAS que el horizontal, y no es gusto: la expandida se abre desde la capsula,
   * asi que el sistema le deja el hueco de la camara arriba y una franja parecida abajo. Con el mismo
   * padding en los cuatro lados el alto quedaba en 90pt — casi el doble del radio, o sea una capsula
   * gorda en vez de la tarjeta redondeada que se ve en el telefono.
   */
  expanded: {
    width: ISLAND.expanded,
    borderRadius: ISLAND.radius,
    paddingHorizontal: ISLAND.pad + 2,
    paddingVertical: Space.xl,
    gap: Space.md,
    backgroundColor: Palette.carbon[0],
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  banner: {
    width: ISLAND.banner,
    borderRadius: ISLAND.bannerRadius,
    overflow: 'hidden',
    backgroundColor: Palette.carbon[0],
  },
  lens: {
    width: ISLAND.lens,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eye: {
    width: 11,
    height: 11,
    borderRadius: Radius.pill,
    backgroundColor: Palette.carbon[900],
  },
});
