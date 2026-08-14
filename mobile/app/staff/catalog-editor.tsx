import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { AppImage } from '../../src/components/AppImage';
import { Chip } from '../../src/components/Chip';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { StaffFormSheet, type StaffFormField, type StaffFormValue } from '../../src/components/staff/StaffFormSheet';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { staffApi, type StaffRow } from '../../src/services/api/staff.service';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';

const object = (value: unknown): StaffRow => value && typeof value === 'object' && !Array.isArray(value) ? value as StaffRow : {};
const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const num = (value: StaffFormValue | undefined) => Number(String(value ?? '').replace(',', '.'));
interface EditorForm { title: string; fields: StaffFormField[]; submit: (values: Record<string, StaffFormValue>) => Promise<void>; }

export default function CatalogEditorScreen() {
  const params = useLocalSearchParams<{ productId?: string; branchId?: string }>(); const productId = Number(params.productId); const branchId = params.branchId ? Number(params.branchId) : undefined;
  const { user } = useSession(); const toast = useToast(); const [form, setForm] = useState<EditorForm | null>(null); const [saving, setSaving] = useState(false);
  const resource = useResource<StaffRow[]>({ key: productId ? `staff:catalog-product:${productId}` : null, fetcher: async () => (await staffApi.load('catalog')).rows.filter((row) => Number(row.id) === productId), cacheMs: 30_000 });
  const meta = useResource<StaffRow>({ key: 'staff:catalog-meta', fetcher: staffApi.catalogMeta, cacheMs: 5 * 60_000 });
  const product = resource.data?.[0] ?? {}; const variants = useMemo(() => Array.isArray(product.variants) ? product.variants.map(object) : [], [product.variants]);
  const can = (permission: string) => Boolean(user?.isSuperAdmin || user?.permissions.includes(permission));
  const run = async (action: () => Promise<unknown>, message: string) => { setSaving(true); try { await action(); setForm(null); toast.show({ tone: 'success', message }); await resource.refresh(); } catch (error) { toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar.' }); } finally { setSaving(false); } };
  const editVariant = (variant: StaffRow) => setForm({ title: `Editar ${text(variant.name)}`, fields: [{ key: 'name', label: 'Presentación', value: text(variant.name, ''), required: true }, { key: 'basePrice', label: 'Precio', kind: 'number', value: text(variant.basePrice, ''), required: true }, { key: 'isActive', label: 'Variante activa', kind: 'boolean', value: variant.isActive === true }], submit: (values) => run(() => staffApi.updateVariant(Number(variant.id), { name: values.name, basePrice: num(values.basePrice), isActive: values.isActive }), 'Precio y presentación actualizados.') });
  const nutrition = (variant: StaffRow) => { const current = object(variant.nutrition); setForm({ title: `Nutrición · ${text(variant.name)}`, fields: ['calories','protein','carbs','fat','fiber','sodium'].map((key) => ({ key, label: ({ calories:'Calorías', protein:'Proteína', carbs:'Carbohidratos', fat:'Grasa', fiber:'Fibra', sodium:'Sodio' } as Record<string,string>)[key], kind: 'number' as const, value: text(current[key], '0'), required: ['calories','protein','carbs','fat'].includes(key) })), submit: (values) => run(() => staffApi.updateNutrition(Number(variant.id), Object.fromEntries(Object.entries(values).map(([key,value]) => [key, num(value)]))), 'Información nutricional actualizada.') }); };
  const tagFields = (key: 'allergens' | 'dietaryTags'): StaffFormField[] => { const source = Array.isArray(meta.data?.[key]) ? (meta.data![key] as unknown[]).map(object) : []; const selected = Array.isArray(product[key]) ? (product[key] as unknown[]).map((entry) => String(object(entry).id)) : []; return [{ key: 'ids', label: key === 'allergens' ? 'Alérgenos informados' : 'Etiquetas dietarias', kind: 'multiChoice', value: selected, choices: source.map((entry) => ({ label: text(entry.name), value: String(entry.id) })) }]; };
  const chooseProductImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.84, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const source = result.assets[0];
    const mimeType = source.mimeType === 'image/png' ? 'image/png' : source.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    await run(async () => {
      const uploaded = object(await staffApi.uploadMedia({ fileName: source.fileName ?? `producto-${productId}.${mimeType.split('/')[1]}`, mimeType, dataUrl: `data:${mimeType};base64,${source.base64}`, altText: text(product.name, 'Producto'), category: 'products' }));
      await staffApi.updateProduct(productId, { imageUrl: uploaded.url });
    }, 'Imagen del producto actualizada.');
  };
  const openImageActions = () => Alert.alert('Imagen del producto', 'Elige un archivo o importa una imagen pública.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Importar URL', onPress: () => setForm({ title: 'Importar imagen', fields: [{ key: 'sourceUrl', label: 'URL pública HTTPS', kind: 'url', required: true, placeholder: 'https://sitio.com/imagen.jpg' }, { key: 'altText', label: 'Descripción accesible', kind: 'multiline', value: text(product.name, ''), required: true }], submit: (values) => run(async () => { const imported = object(await staffApi.importMediaFromUrl({ sourceUrl: String(values.sourceUrl).trim(), altText: String(values.altText).trim(), category: 'products' })); await staffApi.updateProduct(productId, { imageUrl: imported.url }); }, 'Imagen importada y aplicada al producto.') }) },
    { text: 'Elegir archivo', onPress: () => void chooseProductImage().catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos abrir la galería.' })) },
  ]);
  return (
    <ScreenScaffold title={text(product.name, 'Producto')} subtitle={`${text(product.type)} · ${text(product.status)}`} showBack>
      <FlatList
        data={variants}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={[styles.hero, shadow.md]}>
            <View style={styles.imageWrap}>
              <AppImage uri={typeof product.imageUrl === 'string' ? product.imageUrl : null} style={styles.image} accessibilityLabel={text(product.name)} />
              {can('catalog.product.write') ? <View style={styles.imageAction}><PrimaryButton label="Cambiar imagen" icon="image-edit-outline" variant="secondary" onPress={openImageActions} style={styles.imageButton} /></View> : null}
            </View>
            <View style={styles.copy}><Text style={styles.title}>{text(product.name)}</Text><Text style={styles.muted}>{text(product.description, 'Sin descripción')}</Text><View style={styles.tags}><Chip label={text(product.status) === 'ACTIVE' ? 'Activo' : text(product.status)} size="sm" /><Chip label={text(object(product.category).name, 'Sin categoría')} size="sm" /></View></View>
          </View>
          <View style={styles.toolSection}>
            <View style={styles.sectionHeading}><View style={styles.sectionIcon}><MaterialCommunityIcons name="tune-variant" size={22} color={colors.brand700} /></View><View style={styles.copy}><Text style={styles.sectionTitle}>Configuración del producto</Text><Text style={styles.muted}>Información alimentaria y venta por local.</Text></View></View>
            <View style={styles.actions}>
              {can('allergen.write') ? <PrimaryButton label="Alérgenos" variant="secondary" onPress={() => setForm({ title: 'Alérgenos del producto', fields: tagFields('allergens'), submit: (values) => run(() => staffApi.setAllergens(productId, (values.ids as string[]).map(Number)), 'Alérgenos sincronizados.') })} style={styles.flex} /> : null}
              {can('dietary_tag.write') ? <PrimaryButton label="Etiquetas" variant="secondary" onPress={() => setForm({ title: 'Etiquetas dietarias', fields: tagFields('dietaryTags'), submit: (values) => run(() => staffApi.setDietaryTags(productId, (values.ids as string[]).map(Number)), 'Etiquetas sincronizadas.') })} style={styles.flex} /> : null}
              {can('catalog.availability.write') && branchId ? <PrimaryButton label="Disponibilidad" variant="secondary" onPress={() => setForm({ title: 'Disponibilidad en el local', fields: [{ key: 'isAvailable', label: 'Disponible para vender', kind: 'boolean', value: true }, { key: 'reason', label: 'Motivo si se retira', kind: 'multiline' }], submit: (values) => run(() => staffApi.setProductAvailability(productId, { branchId, isAvailable: Boolean(values.isAvailable), reason: values.isAvailable ? undefined : String(values.reason) }), 'Disponibilidad actualizada.') })} style={styles.flexWide} /> : null}
            </View>
          </View>
          <Text style={styles.variantsTitle}>Presentaciones y precios</Text>
        </>}
        renderItem={({ item }) => <View style={[styles.card, shadow.sm]}><View style={styles.copy}><Text style={styles.title}>{text(item.name)}</Text><Text style={styles.price}>S/ {Number(item.basePrice ?? 0).toFixed(2)}</Text><Text style={styles.muted}>{item.isDefault ? 'Presentación principal' : 'Presentación adicional'} · {item.isActive ? 'Activa' : 'Inactiva'}</Text></View>{can('catalog.product.write') ? <PrimaryButton label="Precio" variant="secondary" onPress={() => editVariant(item)} style={styles.small} /> : null}{can('nutrition.write') ? <PrimaryButton label="Nutrición" variant="secondary" onPress={() => nutrition(item)} style={styles.small} /> : null}</View>}
      />
      {form ? <StaffFormSheet visible title={form.title} fields={form.fields} loading={saving} onClose={() => setForm(null)} onSubmit={form.submit} /> : null}
    </ScreenScaffold>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  hero: { overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface },
  imageWrap: { position: 'relative' },
  image: { height: 220 },
  imageAction: { position: 'absolute', right: spacing.sm, bottom: spacing.sm },
  imageButton: { minHeight: 44, backgroundColor: colors.surface },
  copy: { flex: 1, padding: spacing.md },
  title: { ...type.heading, color: colors.ink },
  muted: { ...type.bodySm, color: colors.inkMuted, marginTop: 3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  toolSection: { gap: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flexGrow: 1, minWidth: 128 },
  flexWide: { flexGrow: 1, minWidth: 180 },
  sectionTitle: { ...type.heading, color: colors.ink },
  variantsTitle: { ...type.title, color: colors.ink, marginTop: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  price: { ...type.heading, color: colors.brand700, marginTop: 4 },
  small: { minHeight: 44, paddingHorizontal: 12 },
});
