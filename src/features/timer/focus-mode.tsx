import { createContext, use, useMemo, useState, type ReactNode } from 'react';

/**
 * Modo enfoque: la cápsula de pestañas se aparta mientras un bloque corre.
 *
 * Vive en un contexto porque el que sabe que hay un bloque corriendo es la pantalla del cronómetro,
 * y el que pinta la barra es el layout del grupo — dos componentes hermanos que no se ven. El layout
 * ya consume `useAuth`, así que un contexto más es el idioma de la casa.
 *
 * Se guarda "escondida" y no "corriendo" a propósito: son dos cosas distintas. Un toque en el fondo
 * devuelve la barra SIN parar el cronómetro, porque enfocarse cincuenta minutos no puede significar
 * quedarte encerrado en una pantalla sin forma de ir a ninguna otra. El bloque manda el estado
 * inicial; a partir de ahí el toque manda.
 */
type FocusMode = {
  /** La barra está apartada. */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  toggle: () => void;
};

const FocusModeContext = createContext<FocusMode | null>(null);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  const value = useMemo<FocusMode>(
    () => ({ hidden, setHidden, toggle: () => setHidden((previous) => !previous) }),
    [hidden]
  );

  return <FocusModeContext value={value}>{children}</FocusModeContext>;
}

/**
 * Devuelve un no-op cuando no hay proveedor en vez de lanzar, al contrario que `useAuth`.
 *
 * Es lo correcto aquí: sin `useAuth` una pantalla no puede pintar nada, pero sin modo enfoque el
 * cronómetro funciona entero y solo se queda sin el detalle de apartar la barra. Que una pantalla
 * fuera del grupo `(app)` pueda montar el cronómetro algún día no debe reventarla.
 */
export function useFocusMode(): FocusMode {
  return use(FocusModeContext) ?? FALLBACK;
}

const FALLBACK: FocusMode = { hidden: false, setHidden: () => {}, toggle: () => {} };
