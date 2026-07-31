import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
/**
 * Import POR ICONO y no del barril (`from 'lucide-react-native'`).
 *
 * No es estilo: medido contra el bundle de Metro, el barril mete **1756 modulos de icono** para usar
 * cuatro. Metro no hace tree-shaking de un re-export asi, asi que eso viaja tambien al build de
 * produccion. Con la ruta por icono entran cuatro archivos.
 *
 * El especificador es el que el propio paquete declara en su `exports` (`"./icons/*"`), no una ruta
 * a `dist/` inventada: los nombres de mas de una palabra van en kebab-case.
 *
 * `LucideIcon` va como `import type`, que se borra al compilar y no arrastra nada.
 */
/*
  `calendar` y no `calendar-days`: los seis puntos del segundo se vuelven bolas al trazo grueso de
  la pestaña activa, y ahi el calendario volvia a pesar mas que los otros tres — la misma queja que
  traia SF Symbols, en version suave. Sin puntos, los cuatro glifos pesan igual en los dos estados,
  y con un sol, un cronometro y una persona al lado no hay forma de leer el rectangulo como otra cosa.
*/
import Calendar from 'lucide-react-native/icons/calendar';
import Sun from 'lucide-react-native/icons/sun';
import Timer from 'lucide-react-native/icons/timer';
import User from 'lucide-react-native/icons/user';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { Radius, Space, useAccent, useScheme, useShadow, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { FocusModeProvider, useFocusMode } from '@/features/timer/focus-mode';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * `isLiquidGlassAvailable()` hace `requireNativeModule('ExpoGlassEffect')`, que LANZA si el
 * binario instalado no trae el modulo. Como esto corre al importar, sin el try/catch un dev
 * build viejo no llega ni al primer render. Ya nos paso con ExpoPushTokenManager.
 */
function detectGlass(): boolean {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/**
 * Constante del build, no del render: el vidrio liquido depende de la version de iOS con la que
 * arranco la app y no cambia mientras corre. Por eso no es un hook.
 *
 * Importa porque el fallback de `GlassView` y de `GlassContainer` es un `View` PELADO: fuera de
 * iOS 26 (y en Android y web) no pintan desenfoque ni relleno. Asi que la capsula se rellena con
 * `t.surface` + sombra cuando esto es false.
 */
const GLASS = detectGlass();

/**
 * Geometria de la capsula. Vive aqui y no en `Touch` porque es de ESTE control: `Touch.icon` son
 * los 44pt minimos del HIG, y la barra los pasa a proposito.
 *
 * Un hueco de 44 con 4 de aire dejaba una capsula de 52 de alto que se leia como una barrita de
 * cromo pegada al borde. A 60 la capsula se lee como el objeto flotante que quiere ser, el area
 * tactil crece un 36% (que en una barra que se toca a ciegas con el pulgar es justo donde se nota)
 * y el vidrio tiene superficie suficiente para que el desenfoque signifique algo.
 */
const SLOT = 60;
/** El aire entre huecos y contra el canto. Sube con el hueco: si no, la capsula queda apretada. */
const GAP = Space.sm;
/**
 * El glifo crece con el hueco, pero menos: sigue habiendo anillo de vidrio alrededor.
 *
 * Baja de 28 a 26 al cambiar de familia. SF Symbols trae su propio aire dentro de la caja y Lucide
 * dibuja hasta el canto de su rejilla de 24, asi que el mismo numero se veia mas grande.
 */
const GLYPH = 26;

/**
 * El grosor del trazo. Es la perilla por la que se cambio de familia de iconos.
 *
 * SF Symbols no la tiene: cada simbolo trae el diseño optico de Apple, y por eso `calendar` (una
 * rejilla densa) pesaba visiblemente mas que `sun.max` (trazos radiales con aire) al mismo tamaño.
 * `weight` solo se mueve dentro de los rangos de Apple y no iguala nada. Con una sola familia
 * dibujada sobre una sola rejilla, un solo numero pone a los cuatro glifos en el mismo peso.
 *
 * La activa sube a 2.25: es una segunda señal, por peso, ademas del resaltado y del acento. En una
 * barra que se toca a ciegas con el pulgar, dos señales se leen antes que una.
 */
const STROKE = 1.75;
const STROKE_ON = 2.25;

/** El paso del resaltado: el ancho de un hueco mas el gap. Fijo, asi no hay que medir nada. */
const SLOT_STEP = SLOT + GAP;

/** Alto de la capsula: un hueco mas el padding arriba y abajo. Entra en `TAB_DOCK`. */
const BAR_H = SLOT + GAP * 2;

/**
 * Ancho exacto de la capsula para n pestañas: n huecos, n-1 gaps y el padding de los lados.
 *
 * Va explicito y no lo deduce el flujo porque el vidrio necesita tamaño en su PRIMER layout:
 * medido en el simulador, un `GlassView` en position absolute dentro de un contenedor que
 * todavia no tiene medidas se monta con marco cero y se queda sin efecto para siempre.
 *
 * Con cuatro pestañas son 280pt. Cabe con aire en el telefono mas angosto que soporta la app (el
 * SE deja 327 entre los margenes del dock), asi que la capsula sigue sin tocar los cantos.
 */
const barWidth = (slots: number) => slots * SLOT + (slots + 1) * GAP;

/**
 * El resaltado llega con inercia. Si solo apareciera no se leeria liquido.
 *
 * Por duracion y no por fisica, a proposito. `{damping: 18, stiffness: 220}` es ζ=0.61 y ωn=14.8:
 * ~435ms hasta asentarse con 11% de sobrepaso, o sea que en un salto de 68pt el resaltado se iba
 * 7pt de largo y volvia. Eso es lo que se sentia gelatina. Con ζ=0.85 el sobrepaso baja a 0.6% —
 * no se ve — y el numero de arriba ES lo que tarda, asi que se ajusta sin recalcular nada.
 */
const SLIDE = { duration: 260, dampingRatio: 0.85 };

/**
 * La salida y la entrada de la capsula en modo enfoque. Sin rebote: la barra se aparta, no se
 * despide. Un muelle con overshoot la haria asomar de vuelta justo cuando el bloque acaba de
 * arrancar, que es el momento en que se quiere que desaparezca y ya.
 */
const DOCK = { damping: 26, stiffness: 190 };

/** Lo que baja la capsula al esconderse: su alto entero mas el aire, para que salga de cuadro. */
const DOCK_AWAY = BAR_H + Space.xl;

/**
 * Mueve el resaltado al hueco `to`.
 *
 * Fuera del componente para que sea la MISMA funcion en cada render: se llama desde un efecto y
 * desde un handler, y una closure nueva cada vez obligaria a envolverla para las dependencias.
 */
const slideTo = (x: SharedValue<number>, to: number, reduced: boolean) => {
  // .set() y no .value =: el compilador de React trata el shared value como inmutable y asignarle
  // rompe el lint (es el error que arrastra use-press-scale).
  x.set(reduced ? to * SLOT_STEP : withSpring(to * SLOT_STEP, SLIDE));
};

/**
 * Distancia a la que dos piezas de vidrio empiezan a fundirse. Corta a proposito: el resaltado
 * y la capsula se solapan siempre, asi que con un valor grande la fusion hincha el resaltado
 * hasta salirsele del canto. Con esto se atraen pero el resaltado sigue siendo una pastilla.
 */
const MERGE = Space.sm;

type Tab = {
  /** Nombre de archivo dentro de (app). */
  name: string;
  label: string;
  /**
   * El icono, como componente. Ya no hay pareja ios/android ni etiqueta de repuesto: Lucide dibuja
   * el mismo SVG en las tres plataformas, asi que no hay nada que se pueda quedar sin cargar.
   */
  icon: LucideIcon;
};

/**
 * La lista ES la barra: el orden lo pone esto y no el sistema de archivos, y cualquier ruta
 * del grupo que no este aqui (new-task) no sale en la barra ni la lleva encima.
 */
const TABS: Tab[] = [
  { name: 'index', label: 'Hoy', icon: Sun },
  // Segunda y no ultima: el cronometro es lo que se hace CON el dia, asi que va pegado al dia.
  { name: 'timer', label: 'Enfoque', icon: Timer },
  { name: 'calendar', label: 'Calendario', icon: Calendar },
  { name: 'profile', label: 'Perfil', icon: User },
];

/**
 * Aire que cada pantalla del grupo deja al final de su scroll para que la capsula no tape
 * la ultima cosa. Sale de la geometria de la barra, asi que vive aqui y se importa: cuatro
 * copias del mismo calculo se desincronizan en cuanto la barra cambie de alto.
 *
 * Se lee: alto de la capsula + lo que despega del borde + un respiro. Si cambias `BAR_H` o
 * el `paddingBottom` del dock, esto se mueve con ellos.
 */
export const TAB_DOCK = BAR_H + Space.md + Space.xl;

/**
 * Una pestaña. Es su propio componente por el hook: `usePressScale` no puede vivir dentro
 * del `map`, y el hundido al tocar es la mitad de la respuesta (el resto lo da el haptico).
 */
function TabSlot({
  tab,
  focused,
  onPress,
}: {
  tab: Tab;
  focused: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  // 0.9 y no 0.86: es el mismo hundido que la celda de dia de la tira de semana, el otro objetivo
  // pequeño y redondo de la app. A 0.86 el glifo brincaba mas que cualquier otra cosa que se toca.
  const press = usePressScale({ to: 0.9, haptic: Haptics.ImpactFeedbackStyle.Light });
  const tint = focused ? t.text : t.textMuted;
  const Icon = tab.icon;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.slot}>
      {/* El escalado va en el glifo y no en el Pressable: el area tactil se queda entera. */}
      <Animated.View style={press.style}>
        {/* Un SVG, no un simbolo del sistema: no hace falta `fallback`, asi que tampoco hay una
            etiqueta de texto con su propia tipografia colandose en la barra. */}
        <Icon size={GLYPH} color={tint} strokeWidth={focused ? STROKE_ON : STROKE} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * El vidrio tiene que poder MOVERSE, y `Animated.View` alrededor lo sacaria del contenedor de
 * vidrio. `GlassView` reparte todas sus props sobre la vista nativa, incluida la ref (React 19),
 * asi que reanimated puede animarlo directo.
 */
const AnimatedGlass = Animated.createAnimatedComponent(GlassView);

/**
 * Capsula flotante de vidrio, no barra pegada al borde. SOLO navegacion: tres pestañas.
 *
 * El + de anotar vivia aqui y se fue: mezclaba "ir a" con "crear" en el mismo control. Ahora
 * la hoja de captura se abre desde la card del home y la barra hace una sola cosa. Con tres
 * huecos la capsula ya no necesita el ancho completo, asi que va compacta y centrada.
 *
 * El resaltado de la pestaña activa es su PROPIA pieza de vidrio, no un relleno plano: dentro
 * de un `GlassContainer` las dos piezas se atraen, y al cambiar de pestaña el resaltado se
 * desliza con muelle en vez de aparecer. Eso es lo que se lee como liquid glass.
 */
function FloatingTabs({ state, navigation, insets }: BottomTabBarProps) {
  const t = useTheme();
  const scheme = useScheme();
  const shadow = useShadow();
  const { user } = useAuth();
  const accent = useAccent(user?.accentColor);
  const { hidden } = useFocusMode();
  /*
    reanimated ya envuelve AccessibilityInfo y escucha sus cambios: leerlo con un hook evita el
    frame en blanco de resolver una promesa en un efecto. La tira de semana y las tarjetas del dia
    ya lo consultaban — la barra era la unica pieza que animaba a ciegas.
  */
  const reduced = useReducedMotion();

  const current = state.routes[state.index]?.name;
  // Una pestaña sin archivo todavia simplemente no aparece. Filtrar ANTES de pintar mantiene
  // el resaltado cuadrado con los huecos: con un `return null` dentro del map se desalinearia.
  const visible = TABS.filter((tab) => state.routes.some((route) => route.name === tab.name));
  const index = visible.findIndex((tab) => tab.name === current);

  const size = { width: barWidth(visible.length), height: BAR_H };
  // Arranca donde toca (un deep link a Perfil no entra deslizandose desde Hoy) y de ahi anima.
  const x = useSharedValue(Math.max(index, 0) * SLOT_STEP);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  /*
    Reconciliacion, no la animacion principal: el toque ya movio el resaltado (ver abajo). Esto
    cubre lo que NO pasa por el toque — un deep link, el gesto de atras, un navigate desde otra
    pantalla. Cuando el toque se adelanto, el muelle ya apunta aqui y esto no se ve.
  */
  useEffect(() => {
    if (index < 0) return;
    slideTo(x, index, reduced);
  }, [index, x, reduced]);

  /**
   * Modo enfoque. Se anima `transform` y `opacity` y NUNCA se desmonta la capsula: un `GlassView`
   * que nace con marco cero se queda sin efecto para siempre (el `isMounted` de GlassView.swift se
   * resuelve una vez), asi que quitarla del arbol y devolverla la dejaria como un rectangulo plano.
   *
   * La barra solo se aparta EN la pantalla del cronometro. El seguro importa: quien revela la
   * capsula para irse a otra pestaña se lleva un `hidden` que sigue en true, y sin esta condicion la
   * barra desapareceria en el calendario — donde no hay nada que la devuelva, porque el toque que la
   * alterna vive en el cronometro.
   */
  const away = useSharedValue(0);
  const gone = hidden && current === 'timer';
  const dock = useAnimatedStyle(() => ({
    transform: [{ translateY: away.get() * DOCK_AWAY }],
    // No baja de 0.0 a 1.0 en linea con el desplazamiento: se apaga antes de llegar abajo para que
    // no se vea cruzar el borde de la pantalla.
    opacity: 1 - away.get(),
  }));

  useEffect(() => {
    const to = gone ? 1 : 0;
    away.set(reduced ? to : withSpring(to, DOCK));
  }, [gone, away, reduced]);

  // El guard va DESPUES de los hooks: en una ruta sin pestaña la barra no se pinta.
  if (index < 0) return null;

  return (
    <Animated.View
      style={[styles.dock, dock, { paddingBottom: insets.bottom + Space.md }]}
      // Apartada no captura nada: sin esto, la capsula invisible seguiria comiendose los toques de
      // la franja de abajo de la pantalla.
      pointerEvents={gone ? 'none' : 'box-none'}>
      {/*
        Tres capas, y el orden importa: capsula (vidrio), resaltado (vidrio) y glifos (planos).
        Las dos piezas de vidrio son HERMANAS dentro del contenedor — es lo que las funde. Meter
        el resaltado DENTRO de la capsula tambien lo pinta, pero vidrio sobre vidrio lo convierte
        en una mancha difusa que se sale del canto: comprobado en el simulador.
      */}
      <GlassContainer spacing={MERGE} style={size}>
        <GlassView
          glassEffectStyle="regular"
          // Sobre un canvas blanco el vidrio sin tinte desaparece: no hay nada detras que
          // refractar. `sunken` lo separa del papel en claro y del negro en oscuro sin pintarlo.
          tintColor={GLASS ? t.sunken : undefined}
          isInteractive
          // No 'auto': la app tiene su propio interruptor de tema, y auto seguiria al del sistema
          // hasta aclarar el vidrio mientras el resto de la app sigue oscuro.
          colorScheme={scheme}
          style={[
            styles.track,
            // Medidas explicitas y no `absoluteFill`: con right/bottom el marco llega en un
            // segundo layout, y el vidrio que nace con marco cero se queda sin efecto para
            // siempre (el `isMounted` de GlassView.swift solo se resuelve una vez).
            size,
            // Hairline, no borde: define el canto de la capsula, que es lo que el vidrio solo
            // no consigue sobre blanco.
            { borderColor: t.line },
            !GLASS && { backgroundColor: t.surface },
            !GLASS && shadow,
          ]}
        />

        <AnimatedGlass
          glassEffectStyle="clear"
          tintColor={accent.soft}
          colorScheme={scheme}
          // Decorativo y transparente al toque: el de la pestaña lo captura ella, y el de los
          // huecos tiene que llegar hasta la capsula para que se estire.
          pointerEvents="none"
          style={[styles.highlight, slide, !GLASS && { backgroundColor: accent.soft }]}
        />

        {/* box-none: los glifos capturan su toque y los huecos caen al vidrio, que asi se estira. */}
        <View style={styles.row} pointerEvents="box-none">
          {visible.map((tab, i) => {
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;

            return (
              <TabSlot
                key={tab.name}
                tab={tab}
                focused={tab.name === current}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (tab.name === current || event.defaultPrevented) return;
                  /*
                    El resaltado arranca ANTES de navegar, y de ahi sale la mitad de la respuesta.
                    El efecto de arriba corre despues de que el navegador confirme la ruta nueva, y
                    entrar por primera vez a una pestaña monta su pantalla bloqueando el hilo de JS
                    justo en medio: el muelle empezaba tarde y se veia el resaltado quieto bajo el
                    dedo. Arrancado aqui ya vive en el hilo de UI y corre aunque JS este ocupado.
                  */
                  slideTo(x, i, reduced);
                  navigation.navigate(route.name);
                }}
              />
            );
          })}
        </View>
      </GlassContainer>
    </Animated.View>
  );
}

export default function AppLayout() {
  const t = useTheme();

  // El proveedor envuelve los Tabs y NO al contrario: la barra es hija de Tabs, asi que tiene que
  // quedar dentro del alcance del contexto para poder apartarse.
  return (
    <FocusModeProvider>
      <Tabs
        tabBar={(props) => <FloatingTabs {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.canvas } }}
      />
    </FocusModeProvider>
  );
}

const styles = StyleSheet.create({
  // Absoluta: no le quita alto a la pantalla, flota encima. Centrada y no estirada: con tres
  // huecos una capsula compacta se lee como objeto, y una barra de borde a borde como cromo.
  dock: {
    position: 'absolute',
    left: Space.xl,
    right: Space.xl,
    bottom: 0,
    alignItems: 'center',
  },
  // El padding y el gap son los que colocan los huecos, asi que TIENEN que coincidir con
  // `barWidth` y con el `left`/`top` del resaltado: de ahi sale la aritmetica del muelle.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    padding: GAP,
  },
  track: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  slot: {
    width: SLOT,
    height: SLOT,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absoluto sobre el primer hueco; de ahi lo mueve el muelle. Los huecos son de ancho fijo,
  // asi que la posicion es aritmetica y no hace falta medir con onLayout.
  highlight: {
    position: 'absolute',
    top: GAP,
    left: GAP,
    width: SLOT,
    height: SLOT,
    borderRadius: Radius.pill,
  },
});
