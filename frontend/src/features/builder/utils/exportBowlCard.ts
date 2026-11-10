import { formatCurrency } from '@lib/format';
import type { BuilderOption } from '../types';

/** Genera una tarjeta cuadrada del bowl para compartir o descargar. */
export const exportBowlCard = async (
  name: string,
  options: Array<BuilderOption & { quantity: number }>,
  total: number,
) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no permite crear la imagen');

  const gradient = context.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#ebf3f9');
  gradient.addColorStop(1, '#fffbf1');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = '#006fb9';
  context.font = '700 34px Arial';
  context.fillText('MISKY CHALLAY', 70, 90);
  context.font = '900 68px Arial';
  context.fillText(name, 70, 175);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(540, 540, 330, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#add1e9';
  context.lineWidth = 28;
  context.stroke();

  const visible = options.slice(0, 10);
  await Promise.all(
    visible.map(async (option, index) => {
      if (!option.imageUrl) return;
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = option.imageUrl;
      try {
        await image.decode();
      } catch {
        return;
      }
      const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2;
      const radius = visible.length > 6 ? 205 : 165;
      const x = 540 + Math.cos(angle) * radius;
      const y = 540 + Math.sin(angle) * radius;
      const size = visible.length > 6 ? 150 : 190;
      context.save();
      context.beginPath();
      context.arc(x, y, size / 2, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, x - size / 2, y - size / 2, size, size);
      context.restore();
    }),
  );

  context.fillStyle = '#17324d';
  context.font = '700 30px Arial';
  context.fillText(
    options
      .slice(0, 6)
      .map((option) => option.name)
      .join(' · ')
      .slice(0, 62),
    70,
    950,
  );
  context.fillStyle = '#006fb9';
  context.font = '900 42px Arial';
  context.fillText(formatCurrency(total), 70, 1010);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No pudimos crear la imagen');
  const file = new File([blob], 'mi-misky-challay.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: 'Mi Misky Challay',
      text: 'Este es el bowl que armé',
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
};
