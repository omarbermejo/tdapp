import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BigButton } from "@/components/ui/big-button";
import { Card, Micro } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Space, Type, useTheme } from "@/constants/theme";
import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";
import { LIVE, invalidate, keyOf } from "@/features/cache/store";
import { useCached } from "@/features/cache/use-cached";
import { ProfileAvatar } from "@/features/profile/avatar";

import { requestsApi, type JoinRequest } from "./api";

/**
 * Quién quiere entrar a un espacio tuyo, y las dos respuestas.
 *
 * Existe porque un código de invitación pasó a ser un enlace y un QR: antes se dictaba de boca en
 * boca y quien lo tuviera entraba, y eso valía. Un enlace reenviado por WhatsApp no — así que un
 * código ABIERTO ya no mete a nadie, deja una solicitud, y esta es la pantalla donde se decide.
 *
 * Vive en Novedades y no en el espacio, y esa es la decisión: la pregunta que se hace alguien al
 * abrir la app es "¿ha pasado algo?", no "¿ha pasado algo EN ESTE espacio?". Buscarlas espacio por
 * espacio significaría no encontrarlas nunca.
 *
 * Política `LIVE` (15 s) y no `WARM`: alguien esperando a que le dejes entrar es lo más caduco que
 * pinta la app. Con cinco minutos aprobarías a quien ya aprobaste desde otro aparato.
 */
export function JoinRequests() {
  const { token } = useAuth();
  const t = useTheme();
  const [problem, setProblem] = useState("");
  /** A quién se está respondiendo. Bloquea SU fila y no la lista: las demás siguen decidibles. */
  const [busy, setBusy] = useState<number | null>(null);

  const fetcher = useCallback(async () => {
    if (!token) return { requests: [] as JoinRequest[] };
    return requestsApi.list(token);
  }, [token]);

  const { data, reload } = useCached(
    token ? keyOf("workspaces", "requests") : null,
    fetcher,
    LIVE,
  );
  const requests = data?.requests ?? [];

  /** Se pinta sola o no se pinta. Un "nadie ha pedido entrar" es una sección vacía cada día. */
  if (!requests.length) return null;

  const decide = async (item: JoinRequest, approve: boolean) => {
    if (!token) return;
    setProblem("");
    setBusy(item.person.id);
    try {
      await requestsApi.decide(
        token,
        item.workspace.id,
        item.person.id,
        approve,
      );
      await reload();
      // Si se aprobó, también invalida el cache de workspaces para que se refresque la lista
      if (approve) {
        invalidate("workspaces");
      }
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "No se pudo responder");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Micro>Quieren entrar</Micro>

      {requests.map((item) => (
        <View key={`${item.workspace.id}-${item.person.id}`} style={styles.row}>
          <View style={styles.who}>
            <ProfileAvatar user={item.person} />
            <View style={styles.name}>
              <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
                {item.person.name}
              </Text>
              {/* El espacio va DEBAJO del nombre: con varios espacios, "a cuál" es la mitad del dato. */}
              <Text
                style={[Type.hint, { color: t.textMuted }]}
                numberOfLines={1}
              >
                a {item.workspace.name}
              </Text>
            </View>
          </View>

          {/*
            Las dos respuestas con el MISMO peso visual, y ninguna sólida.
            Un "Aceptar" en primario haría que decir que sí se sintiera como lo que se espera de ti, y
            dejar entrar a alguien a tu espacio no es un trámite.
          */}
          <View style={styles.answers}>
            <BigButton
              label="Sí"
              variant="outline"
              loading={busy === item.person.id}
              onPress={() => void decide(item, true)}
              style={styles.answer}
            />
            <BigButton
              label="No"
              variant="ghost"
              accent="copper"
              onPress={() => void decide(item, false)}
              style={styles.answer}
            />
          </View>
        </View>
      ))}

      <FormError message={problem} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Space.md },
  who: { flexDirection: "row", alignItems: "center", gap: Space.md },
  name: { flex: 1, gap: 2 },
  answers: { flexDirection: "row", gap: Space.sm },
  answer: { flex: 1 },
});
