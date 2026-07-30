// ponytail: en web el flujo de Google exige un client ID de tipo web que todavia no existe,
// y el hook nativo revienta sin el. Cuando lo haya: borrar este archivo y pasar webClientId.
export function useGoogleSignIn() {
  return { available: false, loading: false, error: '', signIn: () => {} };
}
