import { cakePreviewDesign, type CakeVisualDesign } from './cakeVisualDesign';

export const cakeVisualDraftKey = (slug: string, theme: string | null, token: string | null, itemId?: string) =>
  `cake-visual:v1:${JSON.stringify([slug, theme, token, itemId ?? null])}`;

export const readCakeVisualDraft = (key: string): { design: CakeVisualDesign; reference: string | null; description?: string; details?: { inscription: string; occasion: string; finish: string } } | null => {
  try {
    const stored = sessionStorage.getItem(key);
    if (!stored || stored.length > 310_000) return null;
    const value = JSON.parse(stored);
    const design = value?.design;
    const image = design?.image;
    if (design?.referenceMode !== undefined && !['reconstruct', 'print'].includes(design.referenceMode)) return null;
    if (design?.reconstruction && (!/^[A-Za-z0-9_-]{32}$/.test(design.reconstruction.token) || !/^[a-f0-9]{64}$/.test(design.reconstruction.sourceHash))) return null;
    if (design?.version !== 1 || !(design.icingColor === null || /^#[0-9a-f]{6}$/i.test(design.icingColor)) ||
      !image || typeof image.visible !== 'boolean' || !['top', 'front', 'topper'].includes(image.placement) ||
      ![[image.scale, .3, 1], [image.rotation, -180, 180], [image.offsetX, -1, 1], [image.offsetY, -1, 1]].every(([number, min, max]) => typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max) ||
      !(value.reference === null || typeof value.reference === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(value.reference))) return null;
    const restored = { design: cakePreviewDesign(design), reference: value.reference, description: typeof value.description === 'string' ? value.description.slice(0, 500) : undefined, details: value.details && ['inscription', 'occasion', 'finish'].every((field) => typeof value.details[field] === 'string' && value.details[field].length <= 300) ? value.details : undefined };
    if (JSON.stringify(restored.design) !== JSON.stringify(design)) {
      try { sessionStorage.setItem(key, JSON.stringify(restored)); }
      catch { /* Keep the restored model even if the browser cannot save the migration. */ }
    }
    return restored;
  } catch { return null; }
};

export const writeCakeVisualDraft = (key: string, design: CakeVisualDesign, reference: string | null) => {
  try { const previous = readCakeVisualDraft(key); sessionStorage.setItem(key, JSON.stringify({ ...previous, design: cakePreviewDesign(design), reference })); window.dispatchEvent(new Event('dulceflow:draft-changed')); }
  catch { window.dispatchEvent(new Event('dulceflow:storage-error')); }
};

export const writeCakeDetailsDraft = (key: string, description: string, details: { inscription: string; occasion: string; finish: string }, design: CakeVisualDesign, reference: string | null) => {
  try { sessionStorage.setItem(key, JSON.stringify({ design: cakePreviewDesign(design), reference, description, details })); window.dispatchEvent(new Event('dulceflow:draft-changed')); }
  catch { window.dispatchEvent(new Event('dulceflow:storage-error')); }
};
