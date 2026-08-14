import type { QuoteResult } from '@modules/customization/customization.service';

type SnapshotSource = Pick<QuoteResult, 'variantName' | 'description'>;

/**
 * Separa el nombre corto de la presentación de la descripción completa del bowl.
 * Antes ambos campos recibían `description`, por lo que un bowl con muchos
 * ingredientes desbordaba el VARCHAR(120) de `variant_name_snapshot`.
 */
export const buildOrderItemSnapshot = (line: SnapshotSource) => ({
  variantNameSnapshot: line.variantName.trim() || null,
  descriptionSnapshot: line.description.trim() || null,
});
