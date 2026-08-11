import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/tokens';
import { BrandLogo } from './BrandLogo';

interface AuthScaffoldProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthScaffold({ eyebrow, title, description, children }: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
            <MaterialCommunityIcons name="arrow-left" size={23} color={colors.brand900} />
          </Pressable>
          <BrandLogo />
          <View style={styles.backSpacer} />
        </View>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <View style={styles.card}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brand50 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  backSpacer: { width: 42 },
  intro: { paddingHorizontal: spacing.sm, paddingTop: 42, paddingBottom: spacing.lg },
  eyebrow: { color: colors.brand600, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: colors.brand900, fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -1, marginTop: 8 },
  description: { color: colors.inkMuted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, shadowColor: colors.brand900, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
});
