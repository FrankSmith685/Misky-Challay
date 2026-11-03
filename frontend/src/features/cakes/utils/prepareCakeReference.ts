/** Keep the reference small enough for the cart and the provider's image input. */
export const prepareCakeReference = async (file: File): Promise<string> => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
    throw new Error('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
  }
  const url = URL.createObjectURL(file);
  try {
    return await compactCakeReference(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Strip metadata and limit public snapshots, including references from the design wizard. */
export const compactCakeReference = async (source: string): Promise<string> => {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  for (const quality of [0.72, 0.6, 0.45]) {
    if (dataUrl.length <= 290_000) break;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > 290_000) throw new Error('La imagen sigue siendo demasiado grande. Prueba otra foto.');
  return dataUrl;
};
