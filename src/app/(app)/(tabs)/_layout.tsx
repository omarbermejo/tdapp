import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Type, useAccent, useScheme, useShadow, useTheme } from '@/constants/theme';
import type { User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvatar } from '@/features/profile/avatar';
import { DockProvider, useDock } from '@/features/nav/dock';
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
const SLOT_H = 60;

/**
 * El ancho de una pestaña APAGADA. 48 y no 60, y no es un recorte gratis: la activa se ensancha
 * para caber su nombre, y el presupuesto sale de las otras tres.
 *
 * 48 sigue por encima de los 44 del HIG con cuatro puntos de margen, y el alto se queda en 60 — que
 * es el eje por el que se falla al tocar a ciegas con el pulgar, porque el dedo rueda hacia arriba y
 * hacia abajo antes que hacia los lados.
 */
const SLOT_OFF = 48;

/**
 * El ancho de la pestaña ACTIVA. Fijo, y esa es la decision: NO depende de lo larga que sea su
 * etiqueta.
 *
 * Si dependiera, `BAR_W` dejaria de ser una constante de modulo — y el docstring de abajo explica
 * por que eso no es negociable: un `GlassView` que nace sin medidas se queda plano para siempre. Con
 * el ancho fijo la capsula mide siempre igual y el resaltado solo cambia de sitio.
 *
 * 128 deja 104 de contenido (menos `Space.md` a cada lado): glifo 32 + `Space.sm` + **64pt de
 * etiqueta**. En Outfit Medium 15 eso son 'Hoy' (~27), 'Enfoque' (~56) y 'Perfil' (~35). 'Calendario'
 * (~74) NO cabia, y por eso esa pestaña se llama ahora 'Agenda' — ver `TABS`.
 */
const SLOT_ON = 128;
/** El aire entre huecos y contra el canto. Sube con el hueco: si no, la capsula queda apretada. */
const GAP = Space.sm;
/**
 * El glifo crece con el hueco, pero menos: sigue habiendo anillo de vidrio alrededor.
 *
 * Sube de 26 a 32 al pasar a los iconos 3D. No es preferencia: 32 es el PISO al que un render con
 * volumen todavia se lee como objeto — por debajo queda una silueta, que es peor que un trazo. Se
 * midio con seis iconos a 24, 28, 32, 44 y 88pt sobre papel y sobre tarjeta, y dentro de una
 * maqueta de esta misma capsula. Que quepa es cosa de que la barra tiene CUATRO pestañas: con cinco
 * el hueco habria bajado a 54 y el glifo con el.
 */
const GLYPH = Icon3DSize.md;

/**
 * Cuanto encoge la pestaña inactiva. Es la UNICA diferencia entre activa e inactiva en el glifo.
 *
 * Antes eran dos señales — color y grosor de trazo — porque un glifo monocromo de linea es poco
 * llamativo y "dos señales se leen antes que una". Un objeto 3D de color no tiene ese problema, y
 * ninguna de las dos perillas viejas existe en un PNG. Lo que si existe ya estaba: el resaltado de
 * vidrio que se desliza bajo la pestaña activa. Esa es la señal.
 *
 * Y NO se baja la opacidad de la inactiva. Sobre liquid glass, que de por si baja el contraste, un
 * glifo a media opacidad da lodo y no un estado apagado; y una segunda copia del asset tintada
 * obligaria a `Image.prefetch` para que no se viera un frame del bitmap anterior al cambiar.
 */
const GLYPH_OFF = 0.92;

/**
 * Cuanto se corre el resaltado por cada pestaña APAGADA que tiene a su izquierda.
 *
 * Antes era "el paso del resaltado" porque todos los huecos median lo mismo. Ahora solo el activo es
 * ancho — y como el activo es siempre el ultimo de los que quedan a su izquierda, todo lo anterior a
 * el es apagado: el desplazamiento acumulado sigue siendo `i * STEP` exacto, sin tabla ni medidas.
 */
const STEP = SLOT_OFF + GAP;

/** Alto de la capsula: el alto de un hueco mas el padding arriba y abajo. Entra en `TAB_DOCK`. */
const BAR_H = SLOT_H + GAP * 2;

/**
 * Ancho exacto de la capsula para n pestañas: n-1 huecos apagados, uno encendido, y n+1 gaps.
 *
 * Va explicito y no lo deduce el flujo porque el vidrio necesita tamaño en su PRIMER layout:
 * medido en el simulador, un `GlassView` en position absolute dentro de un contenedor que
 * todavia no tiene medidas se monta con marco cero y se queda sin efecto para siempre. Por eso
 * tambien el hueco activo mide lo mismo sea cual sea su etiqueta: si el ancho de la capsula
 * dependiera del texto, cambiaria al navegar y el vidrio tendria que remedirse en caliente.
 *
 * Con cuatro pestañas: 3*48 + 128 + 5*8 = **312pt**. El telefono mas angosto que soporta la app (el
 * SE, 375) deja 327 entre los margenes del dock, asi que sobran 7.5pt de aire a cada lado y la
 * capsula sigue sin tocar los cantos. En un 16 Pro Max sobran 40 por lado.
 */
const barWidth = (slots: number) => (slots - 1) * SLOT_OFF + SLOT_ON + (slots + 1) * GAP;

/**
 * La salida y la entrada de la capsula en modo enfoque. Sin rebote: la barra se aparta, no se
 * despide. Un muelle con overshoot la haria asomar de vuelta justo cuando el bloque acaba de
 * arrancar, que es el momento en que se quiere que desaparezca y ya.
 */
const DOCK = { damping: 26, stiffness: 190 };

/** Lo que baja la capsula al esconderse: su alto entero mas el aire, para que salga de cuadro. */
const DOCK_AWAY = BAR_H + Space.xl;

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
   * El icono 3D, por slug. No hay pareja ios/android ni etiqueta de repuesto: es un asset del
   * bundle y se dibuja igual en las tres plataformas.
   */
  icon: Icon3DName;
  /**
   * La cara de la persona en vez del glifo. Solo Perfil.
   *
   * Un flag y no `icon: Icon3DName | 'avatar'`: el icono se queda como respaldo REAL — una sesion a
   * medio cargar todavia no tiene `user`, y `ProfileAvatar` necesita uno.
   */
  avatar?: true;
};

/**
 * La lista ES la barra: el orden lo pone esto y no el sistema de archivos, y cualquier ruta
 * del grupo que no este aqui (new-task) no sale en la barra ni la lleva encima.
 */
const TABS: Tab[] = [
  // 'home-chrome' y no 'home': la casa del AREA es calida y aqui tiene que ser cromo. Ver icon3d.
  { name: 'index', label: 'Hoy', icon: 'home-chrome' },
  // Segunda y no ultima: el cronometro es lo que se hace CON el dia, asi que va pegado al dia.
  { name: 'timer', label: 'Enfoque', icon: 'clock' },
  // 'Agenda' y no 'Calendario': una etiqueta de pestaña es un NOMBRE, no una descripcion, y
  // 'Calendario' (~74pt) no cabe en los 64 del hueco activo. Ademas describe mejor lo que esa
  // pantalla es: un planificador de dia y semana, no un mes con cuadritos. La ruta no cambia.
  { name: 'calendar', label: 'Agenda', icon: 'calendar' },
  { name: 'profile', label: 'Perfil', icon: 'user', avatar: true },
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
  user,
  onPress,
}: {
  tab: Tab;
  focused: boolean;
  /** Para la pestaña con `avatar`. `null` mientras la sesion carga: ahi manda el icono. */
  user: User | null;
  onPress: () => void;
}) {
  const t = useTheme();
  // 0.9 y no 0.86: es el mismo hundido que la celda de dia de la tira de semana, el otro objetivo
  // pequeño y redondo de la app. A 0.86 el glifo brincaba mas que cualquier otra cosa que se toca.
  const press = usePressScale({ to: 0.9, haptic: Haptics.ImpactFeedbackStyle.Light });
  const glyph = focused ? GLYPH : GLYPH * GLYPH_OFF;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.slot, focused ? styles.slotOn : styles.slotOff]}>
      {/* El escalado va en el glifo y no en el Pressable: el area tactil se queda entera. */}
      <Animated.View style={press.style}>
        {/*
          La cara de la persona en su pestaña. `Avatar3DSize.sm` es 32, o sea exactamente `GLYPH`:
          el memoji ocupa el mismo hueco que ocupaba el icono y la fila no se mueve.

          Sin memoji, `ProfileAvatar` pinta la inicial sobre `accent.soft` — que es el MISMO color
          que el resaltado, asi que activo desapareceria. Por eso ahi se le pasa `t.sunken`.
        */}
        {tab.avatar && user ? (
          <ProfileAvatar user={user} size={glyph} bg={focused ? t.sunken : undefined} />
        ) : (
          /* Un asset del bundle, no un simbolo del sistema: no hace falta `fallback`, asi que
             tampoco hay una etiqueta de texto con su propia tipografia colandose en la barra. */
          <Icon3D name={tab.icon} size={glyph} />
        )}
      </Animated.View>

      {/*
        El nombre, solo en la activa. Es la señal que sustituye al resaltado que viajaba: antes lo
        que decia "estas aqui" era el movimiento, y sin movimiento hacia falta una palabra.

        `numberOfLines` y `flexShrink` no son decorativos: el hueco es de ANCHO FIJO (ver `SLOT_ON`),
        asi que con el texto del sistema al maximo la etiqueta tiene que ELIDIRSE en vez de empujar
        la capsula. El tope de escala evita llegar a "Enfo…" en el ajuste por defecto.
      */}
      {focused && (
        <Text
          style={[Type.label, styles.tag, { color: t.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}>
          {tab.label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Capsula flotante de vidrio, no barra pegada al borde. SOLO navegacion: tres pestañas.
 *
 * El + de anotar vivia aqui y se fue: mezclaba "ir a" con "crear" en el mismo control. Ahora
 * la hoja de captura se abre desde la card del home y la barra hace una sola cosa. Con tres
 * huecos la capsula ya no necesita el ancho completo, asi que va compacta y centrada.
 *
 * El resaltado de la pestaña activa es su PROPIA pieza de vidrio, no un relleno plano: dentro
 * de un `GlassContainer` las dos piezas se atraen, y eso es lo que se lee como liquid glass.
 *
 * **Ya no viaja, y el arrastre se fue con el.** El resaltado se deslizaba de pestaña en pestaña con
 * un muelle de 260ms, y se podia agarrar con el dedo para recorrer la barra. Las dos cosas se
 * quitaron a la vez, y no por capricho:
 *
 * - El deslizamiento era una animacion del propio elemento seleccionado cruzando por encima de los
 *   que no lo estan. Es lo que se pidio quitar.
 * - El arrastre no sobrevive sin el: era su unica respuesta continua —sin resaltado bajo el dedo, es
 *   un deslizamiento a ciegas cuyo unico feedback es que la pantalla de abajo cambia tres veces— y
 *   ademas su aritmetica muere con la geometria nueva. `onUpdate` hacia `Math.round(to / SLOT_STEP)`
 *   porque todos los huecos median lo mismo; con la activa ensanchada los bordes se MUEVEN bajo el
 *   dedo en cuanto cruzas el primero.
 *
 * Lo que dice "estas aqui" pasa a ser la ETIQUETA de la pestaña activa, que es una señal quieta.
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
  /**
   * Dos razones distintas para apartarse, y ganan por separado.
   *
   * `away` es el modo enfoque: un estado que dura lo que dure el bloque. `scroll.away` es el gesto:
   * dura lo que dure el dedo. Se combinan con `max` en vez de sumarse o pisarse — si estan las dos,
   * la barra ya esta fuera y no puede irse dos veces; y al soltar una, la otra la sigue reteniendo.
   */
  const scroll = useDock();
  const dock = useAnimatedStyle(() => {
    const out = Math.max(away.get(), scroll.away.get());
    return {
      transform: [{ translateY: out * DOCK_AWAY }],
      // No baja de 0.0 a 1.0 en linea con el desplazamiento: se apaga antes de llegar abajo para que
      // no se vea cruzar el borde de la pantalla.
      opacity: 1 - out,
    };
  });

  useEffect(() => {
    const to = gone ? 1 : 0;
    away.set(reduced ? to : withSpring(to, DOCK));
  }, [gone, away, reduced]);

  /**
   * Cambiar de pestaña devuelve la barra.
   *
   * Sin esto, esconderla bajando en el inicio y saltar al calendario por un deep link te dejaria en
   * una pantalla sin navegacion visible hasta que se te ocurriera subir. El gesto es de la lista que
   * estabas mirando, no del navegador.
   */
  useEffect(() => {
    scroll.reveal();
  }, [current, scroll]);

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

        <GlassView
          glassEffectStyle="clear"
          tintColor={accent.soft}
          colorScheme={scheme}
          // Decorativo y transparente al toque: el de la pestaña lo captura ella, y el de los
          // huecos tiene que llegar hasta la capsula para que se estire.
          pointerEvents="none"
          style={[
            styles.highlight,
            /*
              Posicion aritmetica, sin shared value: `i * STEP` porque todos los huecos a la
              IZQUIERDA del activo son apagados y miden lo mismo. El vidrio nace con `width` y
              `height` explicitos y solo cambia `transform`, asi que nunca se queda sin medidas —
              que es la trampa del `isMounted` de GlassView.swift.
            */
            { transform: [{ translateX: index * STEP }] },
            !GLASS && { backgroundColor: accent.soft },
          ]}
        />

        {/* box-none: los glifos capturan su toque y los huecos caen al vidrio, que asi se estira. */}
        <View style={styles.row} pointerEvents="box-none">
          {visible.map((tab) => {
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;

            return (
              <TabSlot
                key={tab.name}
                tab={tab}
                focused={tab.name === current}
                user={user}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (tab.name === current || event.defaultPrevented) return;
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
      <DockProvider>
      <Tabs
        tabBar={(props) => <FloatingTabs {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: t.canvas },
          /**
           * Cambiar de pestaña deja de ser un CORTE, y deja de entrar en blanco.
           *
           * Eran dos problemas y tienen una sola respuesta conjunta:
           *
           * 1. El default de este navegador es `animation: 'none'`. Era la unica transicion que le
           *    faltaba a la app — la pila ya empuja y las hojas ya suben.
           * 2. Y es perezoso: la primera vez que tocas una pestaña, su pantalla se monta EN ESE
           *    momento, asi que lo que entra es el canvas vacio. Con el corte no se notaba; con una
           *    transicion se ve entrar la nada.
           *
           * **`lazy: false` se probo y se retiro.** Montar las cuatro al arrancar mataba el blanco de
           * la primera visita, pero trajo uno peor: con `'shift'` dejaba las escenas FUERA DE SITIO
           * —la agenda en blanco permanente con la barra encima— y con `'fade'` seguia apareciendo
           * en blanco al volver al grupo con `replace`. Dos fallos distintos con la misma causa: en
           * esta version del navegador, precargar las escenas y animarlas no se llevan bien.
           *
           * Asi que se queda perezoso. El coste es el que ya habia: la PRIMERA vez que tocas una
           * pestaña se ve un instante de canvas mientras se monta. Es una vez por arranque y por
           * pestaña, contra una pantalla que se queda vacia y no vuelve. No es un empate.
           *
           * `'fade'` y no `'shift'` por lo mismo: aunque ya no hay precarga, el fundido es el que se
           * verifico estable en el simulador. El orden de las pestañas lo cuenta el resaltado.
           */
          animation: 'fade',
          transitionSpec: {
            animation: 'spring',
            config: { damping: 26, stiffness: 220, mass: 0.9 },
          },
        }}
      />
      </DockProvider>
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
    height: SLOT_H,
    // En fila para que el glifo y la etiqueta compartan linea. Con la pestaña apagada solo hay
    // glifo, asi que `center` lo deja centrado igual que antes.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    borderRadius: Radius.pill,
  },
  slotOff: { width: SLOT_OFF },
  slotOn: { width: SLOT_ON, paddingHorizontal: Space.md },
  /** `flexShrink` y no `flex: 1`: la etiqueta cede ancho si hace falta, pero no lo reclama. */
  tag: { flexShrink: 1 },
  // Absoluto sobre el primer hueco; de ahi lo corre `translateX`. Mide como el hueco ENCENDIDO,
  // que es el unico sobre el que se pinta, y su ancho nunca cambia.
  highlight: {
    position: 'absolute',
    top: GAP,
    left: GAP,
    width: SLOT_ON,
    height: SLOT_H,
    borderRadius: Radius.pill,
  },
});
