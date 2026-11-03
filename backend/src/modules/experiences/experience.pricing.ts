import { randomBytes } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ExperiencePackage,
  ExperienceTemplate,
  ExperienceProject,
  ExperienceEvent,
} from '@database/models/experience.model';
import { ApiError } from '@shared/errors/ApiError';
import { sceneSchema, type PackageSnapshot } from './experience.logic';

export interface ExperienceSelection {
  packageId: number;
  expectedVersion: number;
  brief: string;
}
export const experiencePricing = {
  async quote(input?: ExperienceSelection): Promise<PackageSnapshot | null> {
    if (!input) return null;
    const pack = await ExperiencePackage.findByPk(input.packageId);
    if (!pack?.isActive || Number(pack.price) <= 0)
      throw ApiError.unprocessable('Este adicional no está disponible.');
    if (pack.version !== input.expectedVersion)
      throw ApiError.conflict('El servicio cambió. Vuelve a elegirlo para revisar su precio.');
    return {
      id: pack.id,
      version: pack.version,
      name: pack.name,
      description: pack.description,
      mode: pack.mode,
      price: Number(pack.price),
      validityDays: pack.validityDays,
      revisionsIncluded: pack.revisionsIncluded,
      minLeadHours: pack.minLeadHours,
      paymentRequirement: pack.paymentRequirement,
    };
  },
  async create(
    orderId: number,
    selection: ExperienceSelection,
    snapshot: PackageSnapshot,
    actorId: number | null,
    transaction: Transaction,
  ) {
    const pack = await ExperiencePackage.findByPk(snapshot.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !pack?.isActive ||
      pack.version !== snapshot.version ||
      Number(pack.price) !== snapshot.price
    )
      throw ApiError.conflict('El adicional cambió. Actualiza el resumen antes de pagar.');
    const template = pack.templateId
      ? await ExperienceTemplate.findByPk(pack.templateId, { transaction })
      : null;
    const project = await ExperienceProject.create(
      {
        orderId,
        packageSnapshotJson: snapshot,
        sceneJson:
          template?.sceneJson ??
          sceneSchema.parse({ content: pack.mode === 'VIDEO' ? 'VIDEO' : 'ALIEN' }),
        publishedSceneJson: null,
        brief: selection.brief,
        approvedVersion: null,
        publicToken: randomBytes(24).toString('base64url'),
        previewToken: null,
        previewExpiresAt: null,
        startsAt: null,
        expiresAt: null,
        assignedTo: null,
        customerFeedback: null,
      },
      { transaction },
    );
    await ExperienceEvent.create(
      {
        projectId: project.id,
        actorId,
        action: 'CREATED',
        version: project.version,
        note: 'Adicional contratado con el pedido.',
      },
      { transaction },
    );
  },
};
