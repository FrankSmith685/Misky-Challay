import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow, spacing, type } from '../theme/tokens';
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
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        nestedScrollEnabled
      >
        <View pointerEvents="none" style={styles.orb} />
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
            <MaterialCommunityIcons name="arrow-left" size={23} color={colors.onDark} />
          </Pressable>
          <BrandLogo inverse />
          <View style={styles.backSpacer} />
        </View>
        <View style={styles.intro}>
          <Image source={require('../../assets/misky-challay-square.jpeg')} style={styles.brandArtwork} resizeMode="cover" accessibilityLabel="Misky Challay, Pastelería Personalizada" />
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
  page: { flex: 1, backgroundColor: colors.brand950 },
  scroll: { position: 'relative', flexGrow: 1, paddingHorizontal: spacing.md },
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -130, right: -110, backgroundColor: 'rgba(35,124,82,.35)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.surfaceDarkRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  backSpacer: { width: 42 },
  intro: { paddingHorizontal: spacing.sm, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  brandArtwork: { width: 112, height: 112, borderRadius: radius.lg, marginBottom: spacing.lg },
  eyebrow: { ...type.label, color: colors.accent400, letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { ...type.hero, color: colors.onDark, marginTop: 8 },
  description: { ...type.body, color: colors.onDarkMuted, marginTop: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, padding: spacing.lg, ...shadow.lg },
});
