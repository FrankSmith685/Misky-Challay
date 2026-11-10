import QRCode from 'qrcode';
import { CAKE_AR_TARGET } from './cakeAr';

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('No se pudo preparar la tarjeta. Vuelve a intentarlo.'));
  image.src = src;
});

/** Keep the exact target uncropped. The variable QR and dates stay outside it. */
export const createCakeArCard = async (url: string, expiresAt?: string, recognitionLabel = 'la tarjeta') => {
  const [target, logo, qr] = await Promise.all([
    loadImage(CAKE_AR_TARGET), loadImage('/brand/misky-challay-wordmark.png'),
    QRCode.toDataURL(url, { width: 480, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#003a60', light: '#ffffff' } }).then(loadImage),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 2200; canvas.height = 1556;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite descargar la tarjeta.');
  ctx.fillStyle = '#f5faff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(logo, 100, 55, 500, logo.naturalHeight * 500 / logo.naturalWidth);
  ctx.fillStyle = '#006fb9'; ctx.font = 'bold 24px Arial';
  ctx.fillText('UN MOMENTO DULCE, EN OTRA DIMENSIÓN', 100, 290);
  ctx.fillStyle = '#17324d'; ctx.font = '52px Georgia';
  ctx.fillText('Tu próxima celebración cobra vida.', 100, 370);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(80, 425, 1380, 940);
  ctx.drawImage(target, 110, 455, 1320, 880);
  ctx.drawImage(qr, 1540, 435, 480, 480);
  ctx.fillStyle = '#17324d'; ctx.font = 'bold 32px Arial';
  ctx.fillText('01  Escanea el QR', 1540, 995);
  ctx.fillText('02  Autoriza la cámara', 1540, 1060);
  ctx.fillText('03  Espera unos segundos', 1540, 1125);
  ctx.fillText('04  Enfoca ' + recognitionLabel, 1540, 1190);
  ctx.fillText('05  Disfruta tu experiencia AR', 1540, 1255);
  ctx.font = '26px Arial';
  ctx.fillText('Buena luz · sin reflejos · sin recortar.', 1540, 1320);
  ctx.fillStyle = '#5e7380'; ctx.font = '24px Arial';
  ctx.fillText('Foto de reconocimiento · imprime sin recortar ni estirar, en papel mate.', 110, 1415);
  ctx.fillText(expiresAt ? `Vista compartida hasta el ${new Date(expiresAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}.` : 'Experiencia ilustrativa Misky Challay · modelo y tamaño orientativos.', 110, 1460);
  return canvas.toDataURL('image/png');
};
