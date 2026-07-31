import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

/**
 * La pila de la sesión. Dentro viven las pestañas y, ENCIMA de ellas, lo que se abre y se cierra.
 *
 * Antes `new-task` era una pestaña más — oculta de la cápsula filtrándola de la lista de `TABS`.
 * Funcionaba de milagro y traía dos problemas de fondo:
 *
 * 1. `router.push('/new-task')` no era un push, era un salto de pestaña. Y una pestaña no se
 *    desmonta al salir, así que el formulario conservaba la tarea anterior entera; había que
 *    vaciarlo a mano desmontándolo con `useIsFocused`. Aquí el pop lo desmonta el navegador.
 * 2. Sin transición de pila no hay dónde colgar un elemento compartido: `sharedTransitionTag` solo
 *    se dispara en un push de native-stack (ver `day-card.tsx` y `new-task.tsx`).
 *
 * El grupo `(tabs)` no aparece en la URL, así que las rutas no cambian: `/` sigue siendo el home y
 * `/new-task` sigue siendo la misma ruta de siempre.
 */
export default function AppLayout() {
  const t = useTheme();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.canvas } }}>
      <Stack.Screen name="(tabs)" />
      {/*
        Push normal y NO `presentation: 'modal'`: en iOS la hoja modal usa otro animador y las
        transiciones compartidas no viajan por ahí. El push de tarjeta además ya trae el gesto de
        volver desde el canto izquierdo, que es la salida que una hoja daría con el swipe hacia abajo.
      */}
      <Stack.Screen name="new-task" />
    </Stack>
  );
}
