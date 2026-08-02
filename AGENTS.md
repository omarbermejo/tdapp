# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Reglas de la app

## Toda pantalla que scrollea lleva `StatusVeil`

El reloj, el wifi y la batería los pinta iOS **encima** de la app, con un color fijo que no se puede
cambiar. En cuanto el contenido pasa por debajo — un título grande, un memoji, una tarjeta blanca —
dejan de leerse. No es un detalle estético: es información del sistema tapada por la app.

Por eso **cualquier pantalla con scroll vertical lo lleva**, sin excepciones que decidir caso por
caso. El patrón son tres líneas:

```tsx
const veil = useScrollVeil();

<Animated.ScrollView {...veil.scrollProps} contentContainerStyle={…}>
  …
</Animated.ScrollView>

<StatusVeil scrollY={veil.scrollY} />   // hermano del scroll, no hijo
```

Vive en [status-veil.tsx](src/components/ui/status-veil.tsx). Es invisible en reposo y aparece a los
24px de scroll: sobre el canvas limpio sería una banda gris sin razón.

**Las dos únicas excepciones, y por qué:**

- **Lo que se presenta como hoja** (`new-task`, `new-workspace`). Una hoja no llega al notch: se abre
  por debajo de la barra de estado con la pantalla anterior encogida detrás. No hay nada que tapar.
- **El calendario**, que ya tiene un velo propio. Ahí el blur separa una barra de controles **fija**
  de la lista que corre por debajo — otro problema y otra solución. `StatusVeil` no fija nada.

**No toquetear sus constantes sin mirar la pantalla.** `BLUR`, `TAIL` y `SOLID` salieron de iterar
contra el simulador, y cada una tiene su docstring con el porqué. En particular: el tamaño está
calibrado contra la **isla dinámica**: el velo muere treinta puntos por debajo del área segura, justo
después de que la isla acaba. Más alto no protege mejor el reloj, solo tapa más pantalla.
