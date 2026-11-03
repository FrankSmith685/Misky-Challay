import { useEffect, useState } from 'react';

/** Explain small source images without blocking an order or inventing detail. */
export const CakeReferenceQuality = ({ source }: { source?: string | null }) => {
  const [size, setSize] = useState<{ source: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!source) return;
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setSize({ source, width: image.naturalWidth, height: image.naturalHeight }); };
    image.src = source;
    return () => { active = false; image.onload = null; };
  }, [source]);
  if (!size || size.source !== source || Math.max(size.width, size.height) >= 512) return null;
  return <p className="rounded-card border border-line bg-surface-muted p-2.5 text-[11px] leading-5 text-ink-muted"><strong className="font-semibold text-ink">Foto pequeña: {size.width} × {size.height} píxeles.</strong> Puedes continuar. Una versión más nítida permite distinguir mejor las letras y los adornos; la reconstrucción seguirá siendo aproximada.</p>;
};
