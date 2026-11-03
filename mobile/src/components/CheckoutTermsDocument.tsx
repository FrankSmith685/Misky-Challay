import { ScrollView, Text, View } from 'react-native';
import { ScreenScaffold } from './ScreenScaffold';
import { PrimaryButton } from './PrimaryButton';
import { useResource } from '../hooks/useResource';
import { checkoutTermsApi } from '../services/api/checkoutTerms.service';
import { colors, spacing, type } from '../theme/tokens';

export function CheckoutTermsDocument() {
  const resource = useResource({ key: 'settings:terms', fetcher: checkoutTermsApi.get, cacheMs: 0, pollIntervalMs: 30000 });
  const terms = resource.data;
  return (
    <ScreenScaffold title="Términos y condiciones" showBack>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {resource.error ? <View><Text style={{ ...type.body, color: colors.ink }}>No pudimos cargar los términos vigentes.</Text><PrimaryButton label="Reintentar" onPress={() => void resource.refetch()} /></View> : !terms ? <Text>Cargando condiciones…</Text> : <>
          <Text style={{ ...type.title, color: colors.ink }}>{terms.title}</Text>
          <Text style={{ ...type.bodySm, color: colors.inkMuted }}>Versión {terms.version} · {new Date(terms.publishedAt).toLocaleDateString('es-PE')}</Text>
          <Text selectable style={{ ...type.body, color: colors.ink }}>{terms.content}</Text>
        </>}
      </ScrollView>
    </ScreenScaffold>
  );
}
