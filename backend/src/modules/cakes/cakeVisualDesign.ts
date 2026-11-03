import { z } from 'zod';

export const cakeVisualDesignSchema = z.object({
  version: z.literal(1),
  icingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  referenceMode: z.enum(['reconstruct', 'print']).optional(),
  reconstruction: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32}$/), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
  image: z.object({
    visible: z.boolean(),
    placement: z.enum(['top', 'front', 'topper']),
    scale: z.number().min(.3).max(1),
    rotation: z.number().min(-180).max(180),
    offsetX: z.number().min(-1).max(1),
    offsetY: z.number().min(-1).max(1),
  }),
});

export type CakeVisualDesign = z.infer<typeof cakeVisualDesignSchema>;

export const describeCakeVisualDesign = (design?: CakeVisualDesign) => {
  if (!design) return '';
  if (design.referenceMode !== 'print' && design.reconstruction) return `Propuesta visual 3D por confirmar: modelo reconstruido desde la foto de referencia; tono ${design.icingColor ?? 'original'}.`;
  const placement = { top: 'superior', front: 'lateral', topper: 'topper' }[design.image.placement];
  return `Propuesta visual 3D por confirmar: cobertura ${design.icingColor ?? 'según catálogo'}; imagen ${design.image.visible ? `${placement}, tamaño ${Math.round(design.image.scale * 100)}%, giro ${design.image.rotation}°, posición ${design.image.offsetX.toFixed(2)}/${design.image.offsetY.toFixed(2)}` : 'oculta'}.`;
};
