import Lock from 'lucide-react-native/icons/lock';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Avatar3D, type Avatar3DName } from '@/components/ui/avatar3d';
import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { Motion, Radius, Space, Type, useAccent, useTheme, type Accent } from '@/constants/theme';
import { ApiError, type Milestone, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { usePressScale } from '@/hooks/use-press-scale';

import { avatarOf } from './avatar';
import type { useAvatars } from './use-avatars';

/**
 * Cuatro por fila, y el ancho sale del hueco disponible en vez de un tamaño en puntos.
 *
 * Con celdas fijas solo entraban tres — la tarjeta se come 48pt de padding — y son quince filas de
 * scroll para una decision de un toque. A cuatro la celda cae a unos 64pt: muy por encima del
 * objetivo tactil minimo, y la cara se reconoce igual.
 */
const COLUMNS = 4;
const BASIS = `${100 / COLUMNS - 2}%` as const;

/** Que se puede hacer con una celda. La forma de la celda sale entera de aqui. */
type CellState = 'owned' | 'locked' | 'offered';

/**
 * Una cara.
 *
 * Tres estados y no dos, y el tercero es el que da sentido a la mecanica:
 *
 * - `owned`   — es tuya. Se toca para ponertela.
 * - `locked`  — no es tuya y hoy no puedes hacer nada. Candado encima y **no se puede tocar**: un
 *               boton que no responde se lee como una app rota, uno que no es boton se lee como una
 *               puerta cerrada, que es justo lo que es.
 * - `offered` — cumpliste el logro y esta es una de las tres. Se toca para QUEDARTELA, y ese toque
 *               no tiene vuelta atras.
 *
 * El borde se queda en 2pt siempre y solo cambia de color, como en `Choice`: animar el grosor movia
 * el contenido un pixel en cada toque.
 */
function Face({
  state,
  on,
  tint,
  onPress,
  label,
  children,
}: {
  state: CellState;
  on: boolean;
  tint: Accent;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.94 });
  const chosen = useSharedValue(on ? 1 : 0);
  const locked = state === 'locked';

  useEffect(() => {
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    chosen.set(withSpring(on ? 1 : 0, Motion.confirm));
  }, [chosen, on]);

  const skin = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(chosen.get(), [0, 1], [t.sunken, tint.soft]),
      borderColor: interpolateColor(chosen.get(), [0, 1], ['transparent', tint.ink]),
    }),
    [t.sunken, tint.soft, tint.ink]
  );

  return (
    <Animated.View style={[styles.slot, locked ? undefined : press.style]}>
      <Animated.View
        style={[
          styles.cell,
          skin,
          // Ofrecida: aro del acento sin relleno. Dice "esta te la puedes quedar" sin fingir que ya
          // es tuya, que es lo que diria pintarla como elegida.
          state === 'offered' && { borderColor: tint.ink, borderStyle: 'dashed' },
        ]}>
        <Pressable
          accessibilityRole={locked ? 'image' : 'radio'}
          accessibilityState={{ checked: on, disabled: locked }}
          accessibilityLabel={label}
          disabled={locked}
          onPress={onPress}
          onPressIn={locked ? undefined : press.onPressIn}
          onPressOut={locked ? undefined : press.onPressOut}
          style={styles.touch}>
          {/*
            La cara bloqueada se ve, apagada, y encima el candado. Esconderla del todo convertiria la
            rejilla en huecos grises y no habria nada que querer; verla es media razon para ir por ella.
          */}
          <View style={[styles.fit, locked && styles.dimmed]}>{children}</View>
          {locked && (
            <View style={styles.lock} pointerEvents="none">
              <Lock size={16} color={t.textMuted} strokeWidth={2.5} />
            </View>
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/** La barra de avance de un logro cerrado. Sin numeros repetidos: el texto ya los dice. */
function Progress({ milestone, tint }: { milestone: Milestone; tint: Accent }) {
  const t = useTheme();
  const share = Math.min(milestone.progress / milestone.target, 1);

  return (
    <View style={[styles.track, { backgroundColor: t.sunken }]}>
      <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: tint.solid }]} />
    </View>
  );
}

/**
 * Elegir cara.
 *
 * Ocho libres desde el primer dia y quince que se ganan de tres en tres. Las libres se guardan AL
 * TOQUE y sin boton: `updateProfile` es optimista, asi que la confirmacion es que la cara de la
 * cabecera cambia en el mismo frame.
 *
 * Las de logro llevan un paso mas — quedarsela y luego ponersela — y ese paso extra es a proposito:
 * elegir una de tres es una decision sin vuelta atras, y meterla en el mismo toque que "pruebate
 * esta" haria que se gastara sin querer.
 */
export function AvatarPicker({
  user,
  avatars,
}: {
  user: User;
  avatars: ReturnType<typeof useAvatars>;
}) {
  const { updateProfile } = useAuth();
  const t = useTheme();
  const tint = useAccent(user.accentColor);
  const [problem, setProblem] = useState('');
  const { state, loading, error, claim, reload } = avatars;

  const current = avatarOf(user.avatar);

  /** Ponerse una cara que ya es suya. */
  const wear = async (avatar: Avatar3DName | null) => {
    setProblem('');
    try {
      await updateProfile({ avatar });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'No se guardó. Se quedó como estaba.');
    }
  };

  /**
   * Quedarse una de las tres de un logro cumplido. PREGUNTA ANTES, y no es ceremonia.
   *
   * Elegir cierra las otras dos para siempre: es la unica accion de la app, aparte de borrar la
   * cuenta, que no se puede deshacer. Un toque de mas — el pulgar rozando al hacer scroll, un
   * doble toque, la pantalla que se repinta bajo el dedo — gasta un premio que costo cincuenta
   * tareas. Se vio pasar durante el desarrollo: tres logros reclamados sin que nadie los tocara.
   *
   * `Alert` nativo y no un panel propio, igual que borrar la cuenta: es el control que el sistema
   * pone por encima de todo lo demas y no lo puede disparar un gesto perdido.
   */
  const take = (milestone: Milestone, avatar: string) => {
    Alert.alert(
      '¿Te quedas con esta?',
      `Es una de las tres de "${milestone.label}". Las otras dos se cierran y no se pueden recuperar.`,
      [
        { text: 'Mejor no', style: 'cancel' },
        {
          text: 'Quedármela',
          onPress: async () => {
            setProblem('');
            try {
              await claim(milestone.id, avatar);
              // Se pone puesta al vuelo: acabas de elegirla entre tres, no hay duda de que la quieres.
              await updateProfile({ avatar });
            } catch (e) {
              setProblem(e instanceof ApiError ? e.message : 'No pudimos guardar esa cara.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.block}>
      <Micro>Tu cara</Micro>
      <Text style={[Type.hint, { color: t.textMuted }]}>
        {loading ? 'Trayendo tus caras…' : 'Toca la que quieras. Se guarda sola.'}
      </Text>

      <View style={styles.grid}>
        {/*
          "Sin cara" va PRIMERO y no al final: quitarse la foto tiene que ser tan facil de encontrar
          como ponersela, y buscarla al fondo de la rejilla no lo es.
        */}
        <Face
          state="owned"
          on={!current}
          tint={tint}
          onPress={() => wear(null)}
          label="Sin foto, usar mi inicial">
          <Text style={[Type.section, { color: t.textMuted }]}>
            {user.name.trim().charAt(0).toUpperCase()}
          </Text>
        </Face>

        {/*
          Las libres salen del API y no de una lista escrita aqui: si la app las supiera, tendria que
          saber tambien cuales NO son libres — y entonces el candado lo decidiria el cliente.
        */}
        {(state?.free ?? []).map((name, i) => (
          <Face
            key={name}
            state="owned"
            on={current === name}
            tint={tint}
            onPress={() => wear(name as Avatar3DName)}
            label={`Avatar ${i + 1}`}>
            <Avatar3D name={name as Avatar3DName} style={styles.face} />
          </Face>
        ))}
      </View>

      {/*
        Cada logro es su propio bloque, con su titulo y su avance. Sueltas en una sola rejilla, las
        quince bloqueadas serian una pared de candados sin explicacion — y la explicacion ES la
        mecanica.
      */}
      {(state?.milestones ?? []).map((milestone) => (
        <View key={milestone.id} style={styles.milestone}>
          <View style={styles.head}>
            <Text style={[Type.label, { color: t.text }]}>{milestone.label}</Text>
            <Text style={[Type.hint, { color: t.textMuted }]}>
              {milestone.chosen
                ? 'Ya elegiste la tuya.'
                : milestone.claimable
                  ? 'Listo. Quédate con una de las tres.'
                  : `${milestone.hint} Llevas ${milestone.progress} de ${milestone.target}.`}
            </Text>
          </View>

          {!milestone.unlocked && <Progress milestone={milestone} tint={tint} />}

          <View style={styles.grid}>
            {milestone.choices.map((name, i) => {
              // Cerrado, o abierto pero elegiste otra: esa cara ya no puede ser tuya.
              const mine = milestone.chosen === name;
              const cell: CellState = mine
                ? 'owned'
                : milestone.claimable
                  ? 'offered'
                  : 'locked';

              return (
                <Face
                  key={name}
                  state={cell}
                  on={current === name}
                  tint={tint}
                  onPress={() => (mine ? wear(name as Avatar3DName) : take(milestone, name))}
                  label={
                    cell === 'locked'
                      ? `Bloqueada. ${milestone.hint}`
                      : cell === 'offered'
                        ? `Quedarte con la opción ${i + 1} de ${milestone.label}`
                        : `Avatar de ${milestone.label}`
                  }>
                  <Avatar3D name={name as Avatar3DName} style={styles.face} />
                </Face>
              );
            })}
          </View>
        </View>
      ))}

      {/*
        El fallo del vestidor se dice y se puede reintentar. Sin esto, un error de red dejaba la
        rejilla con una sola celda y ni una pista de por que — que es peor que una pantalla vacia,
        porque parece que asi es la app.
      */}
      {!!error && !state && (
        <View style={styles.head}>
          <Text style={[Type.hint, { color: t.textMuted }]}>{error}</Text>
          <BigButton
            label="Reintentar"
            variant="ghost"
            accent={user.accentColor}
            onPress={reload}
          />
        </View>
      )}

      <FormError message={problem} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.sm },
  milestone: { gap: Space.sm, paddingTop: Space.md },
  head: { gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, paddingTop: Space.xs },
  // El hueco manda el ancho y `aspectRatio` iguala el alto: la rejilla se adapta sola de un SE a un
  // Max sin un solo tamaño escrito a mano. Sin `flexGrow`: con el, las celdas sobrantes de la ultima
  // fila se repartian todo el ancho y salian del doble de grandes que el resto.
  slot: { flexBasis: BASIS, aspectRatio: 1 },
  cell: { flex: 1, borderRadius: Radius.md, borderWidth: 2, overflow: 'hidden' },
  touch: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Deja un margen dentro de la celda para que el borde de elegido no toque el pelo.
  face: { width: '86%', height: '86%' },
  // Llena la celda. Sin esto el envoltorio no mide nada y el 86% de la cara se calcula sobre cero:
  // las celdas salian vacias. Un porcentaje necesita un padre con tamaño.
  fit: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  // Aqui `opacity` si es correcto: apaga la cara ENTERA y el candado va en una vista hermana.
  dimmed: { opacity: 0.25 },
  lock: { position: 'absolute' },
  track: { height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
});
