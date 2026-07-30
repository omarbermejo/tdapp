import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { AccentName, Accents, Brand, Radius, Type, onAccent } from '@/constants/brand';
import { useAuth } from '@/features/auth/auth-context';
import { DIAGNOSIS, FOCUS_AREAS, PEAK_ENERGY, REMINDER_STYLE } from '@/features/auth/options';

const labelOf = (options: readonly { value: string; label: string; emoji?: string }[], value: string) => {
  const found = options.find((o) => o.value === value);
  return found ? `${found.emoji ?? ''} ${found.label}`.trim() : value;
};

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const accent = (user.accentColor ?? 'electric') as AccentName;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Type.hero, styles.title]}>Hola,{'\n'}{user.name} 👋</Text>

        <View style={[styles.card, { borderColor: Accents[accent] }]}>
          <Text style={[Type.label, styles.cardTitle]}>Tu perfil</Text>
          <Row label="Tipo" value={labelOf(DIAGNOSIS, user.diagnosis)} />
          <Row label="Mejor momento" value={labelOf(PEAK_ENERGY, user.peakEnergy)} />
          <Row label="Recordatorios" value={labelOf(REMINDER_STYLE, user.reminderStyle)} />
          <Row
            label="Focos"
            value={
              user.focusAreas.length
                ? user.focusAreas.map((f) => labelOf(FOCUS_AREAS, f)).join('  ')
                : 'Sin definir'
            }
          />
        </View>

        <View style={[styles.pill, { backgroundColor: Accents[accent] }]}>
          <Text style={[Type.label, { color: onAccent(accent) }]}>{user.email}</Text>
        </View>

        <BigButton label="Cerrar sesión" variant="outline" accent="magenta" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={[Type.hint, styles.rowLabel]}>{label}</Text>
      <Text style={[Type.body, styles.rowValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.ink },
  content: { padding: 24, paddingBottom: 120, gap: 24 },
  title: { color: Brand.text },
  card: {
    backgroundColor: Brand.inkSoft,
    borderRadius: Radius.lg,
    borderWidth: 3,
    padding: 20,
    gap: 16,
  },
  cardTitle: { color: Brand.textMute, textTransform: 'uppercase', letterSpacing: 1 },
  row: { gap: 2 },
  rowLabel: { color: Brand.textMute },
  rowValue: { color: Brand.text, fontWeight: '700' },
  pill: { borderRadius: Radius.pill, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
});
