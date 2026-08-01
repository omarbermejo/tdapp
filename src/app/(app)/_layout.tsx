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
 * 2. Sin transición de pila no había cómo presentarla más que reemplazando la pantalla entera. Como
 *    hoja el home se queda detrás, y eso es lo que hace que anotar se lea como un paréntesis.
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
        Hoja y no push de tarjeta.

        El primer intento fue un push con un elemento compartido (`sharedTransitionTag`) llevando la
        pastilla de "Anotar algo" hasta "Crear". La API existe y quedó bien montada, pero en la mano
        NO se aprecia: dura lo que dura un push de iOS y el objeto que viaja es un botón que acaba
        casi donde estaba, asi que el ojo no tiene nada que seguir.

        La hoja da la continuidad que aquello prometía, y la da de otra forma: el home NO desaparece.
        Se queda detrás, encogido, y la pantalla de anotar sube encima. Eso se lee como "esto está
        ABIERTO sobre mi día" y no como "me fui a otro sitio" — que es exactamente lo que anotar es,
        un paréntesis de tres segundos. Y el gesto de cerrar arrastrando hacia abajo cae en el pulgar,
        no en el canto izquierdo de la pantalla.
      */}
      <Stack.Screen name="new-task" options={{ presentation: 'modal' }} />

      {/*
        Estas dos SI son push de tarjeta, al reves que `new-task`, y por lo mismo que aquella es hoja:
        no son un parentesis, son destinos.

        Ajustes termina en una alerta destructiva — borrar la cuenta — y una hoja que se arrastra
        hacia abajo a media confirmacion es el gesto equivocado. Editar perfil tiene una rejilla de
        cuarenta y cinco caras que hay que recorrer, y ese scroll pelearia con el arrastre de cerrar;
        ademas todo guarda al toque, asi que no hay borrador que descartar, que es justo el argumento
        con el que los paneles del perfil ya descartaron la hoja.
      */}
      <Stack.Screen name="settings" />
      <Stack.Screen name="edit-profile" />
    </Stack>
  );
}
