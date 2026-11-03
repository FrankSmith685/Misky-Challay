import { ApiError } from '@shared/errors/ApiError';

export const decodeCakeOrderReference = (dataUrl: string): { mime: string; bytes: Buffer } => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || dataUrl.length > 300_000) throw ApiError.badRequest('Adjunta una imagen JPG, PNG o WebP de hasta 220 KB');
  const bytes = Buffer.from(match[2], 'base64');
  const mime = match[1];
  const valid = bytes.length > 0 && bytes.length <= 220_000 && (mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) throw ApiError.badRequest('La imagen de referencia no es válida');
  return { mime, bytes };
};
