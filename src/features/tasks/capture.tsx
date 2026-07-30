import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { FormError } from '@/components/ui/form-error';
import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { localIso, tasksApi } from './api';
import { tasksChanged } from './revalidate';

/**
 * Anotar en tres segundos.
 *
 * Es lo mas importante que hace una app para TDAH: sacarte la cosa de la cabeza ANTES de que
 * se pierda. Por eso no hay formulario — un campo, teclado abierto solo, y la tecla de enviar
 * guarda. Ni tamano, ni foco, ni hora: eso se afina despues, cuando ya no se te puede olvidar.
 *
 * Controlada y sin boton propio: quien la abre es el + de la barra de `(app)/_layout`, y desde
 * ahi no hay forma de alcanzar el `reload` de la pantalla de abajo. Por eso al guardar avisa
 * con `tasksChanged()` en vez de recibir un callback.
 */
export function CaptureSheet({
  open,
  onClose,
  accent = 'olive',
}: {
  open: boolean;
  onClose: () => void;
  accent?: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  // Un Modal de RN no hereda el SafeAreaView de la pantalla: el area segura se aplica aqui.
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Limpia y avisa: la hoja sigue montada entre aperturas, asi que si no se borra el campo
  // la siguiente captura empieza con la anterior escrita.
  const close = () => {
    setTitle('');
    setError('');
    onClose();
  };

  const save = async () => {
    const clean = title.trim();
    if (!clean || !token) return;

    setSaving(true);
    setError('');
    try {
      await tasksApi.create(token, { title: clean, dueAt: localIso() });
      tasksChanged();
      close();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.title ?? e.message) : 'No pudimos anotarla');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      {/* Tocar fuera cierra: salir tiene que ser tan barato como entrar. */}
      <Pressable style={[styles.backdrop, { backgroundColor: t.scrim }]} onPress={close} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surface,
              borderTopColor: t.line,
              // Max y no suma: con el teclado abierto el KeyboardAvoidingView ya levanta la
              // hoja, y sumar el inset le colgaria un hueco de 34pt debajo del ultimo boton.
              paddingBottom: Math.max(Space.xl, insets.bottom),
            },
          ]}>
          <Text style={[Type.micro, { color: t.textMuted }]}>Anota y suéltalo</Text>

          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={save}
            returnKeyType="done"
            placeholder="¿Qué traes en la cabeza?"
            placeholderTextColor={t.textMuted}
            selectionColor={tint.ink}
            maxLength={120}
            style={[styles.input, { backgroundColor: t.canvas, borderColor: tint.ink, color: t.text }]}
          />

          <FormError message={error} />

          <BigButton label="Anotar" loading={saving} onPress={save} />

          {/* La salida para cuando SI quieres decidir. Va como fantasma y al final: aqui el
              boton solido sigue siendo anotar, y la hoja no se llena de campos. */}
          <BigButton
            label="Con más detalle"
            variant="ghost"
            accent={accent}
            onPress={() => {
              close();
              router.push('/new-task');
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
  },
  input: {
    minHeight: Touch.input,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    ...Type.body,
  },
});
