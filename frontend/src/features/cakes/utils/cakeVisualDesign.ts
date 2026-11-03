export interface CakeVisualDesign {
  version: 1;
  icingColor: string | null;
  referenceMode?: 'reconstruct' | 'print';
  reconstruction?: { token: string; sourceHash: string };
  image: {
    visible: boolean;
    placement: 'top' | 'front' | 'topper';
    scale: number;
    rotation: number;
    offsetX: number;
    offsetY: number;
  };
}

export const defaultCakeVisualDesign = (): CakeVisualDesign => ({
  version: 1,
  icingColor: null,
  referenceMode: 'reconstruct',
  image: { visible: true, placement: 'top', scale: .65, rotation: 0, offsetX: 0, offsetY: 0 },
});

/** The 3D view keeps source colors; old editor settings must not tint saved cakes. */
export const cakePreviewDesign = (design?: CakeVisualDesign): CakeVisualDesign => ({
  ...defaultCakeVisualDesign(),
  ...(design?.reconstruction ? { reconstruction: design.reconstruction } : {}),
});

/** A newly uploaded cake photo describes the whole cake, including its original colors. */
export const cakeDesignForNewReference = (design: CakeVisualDesign): CakeVisualDesign => ({
  ...design,
  referenceMode: 'reconstruct',
  reconstruction: undefined,
  icingColor: null,
  image: { ...design.image, visible: true },
});

export const describeCakeVisualDesign = (design?: CakeVisualDesign, hasReference = true) => {
  if (!design) return '';
  if (design.referenceMode !== 'print' && design.reconstruction) return `Propuesta visual 3D por confirmar: modelo reconstruido desde la foto de referencia; tono ${design.icingColor ?? 'original'}.`;
  const placement = { top: 'superior', front: 'lateral', topper: 'topper' }[design.image.placement];
  return `Propuesta visual 3D por confirmar: cobertura ${design.icingColor ?? 'según catálogo'}${hasReference ? `; imagen ${design.image.visible ? `${placement}, tamaño ${Math.round(design.image.scale * 100)}%, giro ${design.image.rotation}°, posición ${design.image.offsetX.toFixed(2)}/${design.image.offsetY.toFixed(2)}` : 'oculta'}` : ''}.`;
};
