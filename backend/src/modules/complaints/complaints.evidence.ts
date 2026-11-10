import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Complaint, ComplaintEvidence } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

const evidenceDir = path.resolve(process.cwd(), 'uploads', 'complaints-private');
const signatures: Record<string, (bytes: Buffer) => boolean> = {
  'application/pdf': (bytes) => bytes.subarray(0, 5).toString() === '%PDF-',
  'image/png': (bytes) => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
  'image/jpeg': (bytes) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
  'image/webp': (bytes) => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
};

export const uploadComplaintEvidence = async (complaintId: number, actorId: number, input: { dataUrl: string; fileName: string }) => {
  if (!(await Complaint.findByPk(complaintId))) throw ApiError.notFound('Reclamo no encontrado');
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.dataUrl);
  if (!match) throw ApiError.badRequest('Adjunta un PDF o una imagen JPG, PNG o WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !signatures[match[1]](bytes)) throw ApiError.badRequest('El archivo no es válido o supera 5 MB.');
  const storageName = `${randomUUID()}.bin`;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, storageName), bytes, { flag: 'wx' });
  try {
    return await ComplaintEvidence.create({ complaintId, uploadedBy: actorId, fileName: input.fileName.replace(/[\r\n\\/]/g, '_'), fileUrl: storageName, mimeType: match[1] });
  } catch (error) {
    await unlink(path.join(evidenceDir, storageName)).catch(() => undefined);
    throw error;
  }
};

export const downloadComplaintEvidence = async (complaintId: number, evidenceId: number) => {
  const evidence = await ComplaintEvidence.findOne({ where: { id: evidenceId, complaintId } });
  if (!evidence || !/^[a-f0-9-]{36}\.bin$/.test(evidence.fileUrl)) throw ApiError.notFound('Evidencia no encontrada');
  try {
    return { evidence, bytes: await readFile(path.join(evidenceDir, evidence.fileUrl)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw ApiError.notFound('El archivo no está disponible.');
    throw error;
  }
};
