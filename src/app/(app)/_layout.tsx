import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';
import { ActivityProvider } from '@/features/activity/activity-context';

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

  /*
    Las novedades envuelven la sesion entera y no solo su pantalla: el globo de la campana vive en el
    inicio y la lista en otra ruta, y los dos tienen que ver lo mismo. Aqui dentro tambien va a
    colgar el socket, que necesita un unico punto al que empujar.
  */
  return (
    <ActivityProvider>
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
        Crear un espacio ERA hoja y ahora es push, al reves que `new-task`. Cambió cuando dejó de ser un
        formulario de un campo y pasó a ser cuatro pasos:

        - Cuatro pasos con rejillas y scroll pelean contra el gesto de arrastrar hacia abajo para
          cerrar. Es el mismo argumento con el que `edit-profile` descartó la hoja por su rejilla de
          cuarenta y cinco caras.
        - El paso 3 CREA el espacio, así que a partir de ahí ya no hay borrador que descartar — y una
          hoja promete justo eso, que soltarla no deja nada hecho.
        - Ya no es un paréntesis de tres segundos sobre el día: es donde se decide de qué va tu trabajo.
      */}
      <Stack.Screen name="new-workspace" />

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

      {/*
        El detalle de un espacio tambien es push y no hoja, por el mismo argumento: no es un parentesis
        de tres segundos, es un destino donde se entra a mirar el mapa, el reparto y la lista entera — y
        eso es scroll, que pelearia con el arrastre de cerrar una hoja.
      */}
      <Stack.Screen name="workspace/[id]" />

      {/*
        El selector de espacio, ENCIMA de lo que haya.
        `transparentModal` y no `modal`: la pantalla de abajo se queda visible, que es la mitad del
        sentido — la hoja dice "estas cambiando el contexto de ESTO". Es el unico mecanismo del repo
        que pinta sobre cualquier pantalla sin que cada una lo monte, y por eso vive como ruta.
        `animation: 'fade'` porque el movimiento lo pone la hoja por dentro, con su propio FadeInDown:
        dos deslizamientos superpuestos se leen como un tirón.
      */}
      <Stack.Screen
        name="spaces"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          /**
           * El `contentStyle` de arriba pinta `canvas` en TODAS las pantallas de esta pila, y aqui eso
           * tapaba justo lo que la hoja tiene que dejar ver. Transparente, el velo se superpone a la
           * pantalla de verdad y "estas cambiando el contexto de ESTO" se lee de un vistazo.
           */
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />

      {/* Unirse con un codigo. Hoja como `new-task`: es un paréntesis, no un destino. */}
      <Stack.Screen name="join-workspace" options={{ presentation: 'modal' }} />

      {/*
        Las novedades. Push de tarjeta como ajustes y editar perfil: es un destino con scroll largo,
        no un parentesis de tres segundos, y el arrastre-para-cerrar de una hoja pelearia con la
        lista. La capsula de pestañas no se pinta aqui sin hacer nada — solo existe dentro del
        navegador de `(tabs)`, y esta pantalla se monta encima en el Stack padre.
      */}
      <Stack.Screen name="notifications" />
    </Stack>
    </ActivityProvider>
  );
}
