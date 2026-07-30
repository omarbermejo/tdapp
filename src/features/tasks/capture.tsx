import * as Haptics from 'expo-haptics';
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
import Animated from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { FormError } from '@/components/ui/form-error';
import { Radius, Space, Touch, Type, useAccent, useShadow, useTheme, type AccentName } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { usePressScale } from '@/hooks/use-press-scale';

import { tasksApi } from './api';

/**
 * Anotar en tres segundos.
 *
 * Es lo mas importante que hace una app para TDAH: sacarte la cosa de la cabeza ANTES de que
 * se pierda. Por eso no hay formulario — un campo, teclado abierto solo, y la tecla de enviar
 * guarda. Ni tamano, ni foco, ni hora: eso se afina despues, cuando ya no se te puede olvidar.
 */
export function Capture({ accent = 'olive', onCreated }: { accent?: AccentName; onCreated: () => void }) {
  const t = useTheme();
  const tint = useAccent(accent);
  const shadow = useShadow();
  const { token } = useAuth();
  const press = usePressScale({ to: 0.94, haptic: Haptics.ImpactFeedbackStyle.Medium });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    setOpen(false);
    setTitle('');
    setError('');
  };

  const save = async () => {
    const clean = title.trim();
    if (!clean || !token) return;

    setSaving(true);
    setError('');
    try {
      await tasksApi.create(token, clean);
      onCreated();
      close();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.title ?? e.message) : 'No pudimos anotarla');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Animated.View style={[styles.fabSlot, press.style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anotar algo"
          onPress={() => setOpen(true)}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={[styles.fab, { backgroundColor: t.ink }, shadow]}>
          <Text style={[Type.display, styles.plus, { color: t.onInk }]}>+</Text>
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        {/* Tocar fuera cierra: salir tiene que ser tan barato como entrar. */}
        <Pressable style={styles.backdrop} onPress={close} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: t.surface, borderTopColor: t.line }]}>
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const FAB = 60;

const styles = StyleSheet.create({
  fabSlot: { position: 'absolute', right: Space.xl, bottom: Space.xl },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // El + del sistema trae mucho hueco arriba: se sube para que quede al centro real.
  plus: { marginTop: -4 },

  backdrop: { flex: 1 },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.xl,
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
