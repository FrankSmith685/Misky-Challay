import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { Op, type Transaction } from 'sequelize';
import { sequelize, Order, User } from '@database/models';
import {
  ExperienceAsset,
  ExperienceProject,
  ExperienceEvent,
} from '@database/models/experience.model';
import { ApiError } from '@shared/errors/ApiError';
import { assertBranchScope } from '@shared/utils/scope';
import { settingsService } from '@modules/settings/settings.service';
import { communicationQueue } from '@modules/communications/communications.queue';
import { escapeMessageHtml } from '@modules/communications/communications.logic';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { env } from '@config/env';
import {
  paymentAllows,
  publicExperienceAvailable,
  sceneAssetIds,
  type ExperienceScene,
} from './experience.logic';

const event = (
  project: ExperienceProject,
  actorId: number | null,
  action: string,
  note: string,
  transaction: Transaction,
) =>
  ExperienceEvent.create(
    { projectId: project.id, actorId, action, version: project.version, note },
    { transaction },
  );
export const experienceService = {
  async load(id: number, req: Request, transaction?: Transaction) {
    const project = await ExperienceProject.findByPk(id, { transaction });
    if (!project) throw ApiError.notFound('Experiencia no encontrada.');
    const order = await Order.findByPk(project.orderId, {
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!order) throw ApiError.notFound();
    assertBranchScope(req, order.branchId);
    if (transaction) await project.reload({ transaction, lock: transaction.LOCK.UPDATE });
    return { project, order };
  },
  async customer(orderNumber: string, userId: number, transaction?: Transaction) {
    const order = await Order.findOne({
      where: { orderNumber, userId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!order) throw ApiError.notFound();
    const project = await ExperienceProject.findOne({
      where: { orderId: order.id },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    return { project, order };
  },
  async assets(scene: ExperienceScene, complete = false, projectId?: number) {
    const ids = sceneAssetIds(scene);
    const assets = ids.length
      ? await ExperienceAsset.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: ['id', 'kind', 'sourceImageId', 'projectId'],
        })
      : [];
    if (assets.some((asset) => asset.projectId != null && asset.projectId !== projectId))
      throw ApiError.forbidden('Un archivo pertenece a otro trabajo privado.');
    const expected = {
      modelAssetId: 'MODEL',
      videoAssetId: 'VIDEO',
      audioAssetId: 'AUDIO',
      targetImageAssetId: 'IMAGE',
      targetAssetId: 'TARGET',
    } as const;
    for (const [key, kind] of Object.entries(expected)) {
      const id = scene[key as keyof typeof expected];
      if (id && !assets.some((asset) => asset.id === id && asset.kind === kind))
        throw ApiError.badRequest(
          'Un archivo de la escena ya no existe o no corresponde al tipo esperado.',
        );
    }
    if (
      Boolean(scene.targetAssetId) !== Boolean(scene.targetImageAssetId) ||
      (scene.targetAssetId &&
        assets.find((asset) => asset.id === scene.targetAssetId)?.sourceImageId !==
          scene.targetImageAssetId)
    )
      throw ApiError.badRequest(
        'Compila la tarjeta de reconocimiento con su imagen correspondiente.',
      );
    if (
      complete &&
      ((['MODEL', 'COMBINED'].includes(scene.content) && !scene.modelAssetId) ||
        (['VIDEO', 'COMBINED'].includes(scene.content) && !scene.videoAssetId))
    )
      throw ApiError.badRequest('Completa los archivos de la escena antes de enviarla a revisión.');
  },
  async notify(
    project: ExperienceProject,
    order: Order,
    published: boolean,
    transaction: Transaction,
  ) {
    const settings = await settingsService.getCommunicationSettings();
    if (!settings.orderUpdatesEnabled) return;
    const user = order.userId ? await User.findByPk(order.userId, { transaction }) : null;
    if (!user || user.status !== 'ACTIVE') return;
    const name = published ? 'EXPERIENCE_PUBLISHED' : 'EXPERIENCE_REVIEW_READY';
    const subject = `${published ? 'Tu experiencia QR está publicada' : 'Revisa tu experiencia QR'} · ${order.orderNumber}`;
    const url = new URL(
      `/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`,
      env.FRONTEND_URL,
    ).toString();
    const publicationText =
      project.startsAt && project.startsAt.getTime() > Date.now()
        ? `Tu experiencia tiene publicación programada para ${project.startsAt.toLocaleString('es-PE', { timeZone: 'America/Lima' })}. Consulta su QR y vigencia desde el pedido.`
        : 'Tu experiencia está lista. Descarga el QR desde el pedido.';
    const text = `${published ? publicationText : 'La propuesta está lista. Abre tu pedido para revisarla y aprobarla o solicitar cambios.'}\n${url}`;
    const key = `experience:${project.id}:${project.version}:${name}${published ? `:${project.startsAt?.getTime()}` : ''}`;
    const base = { event: name, subject, orderId: order.id, userId: user.id, transaction };
    const payload = { experienceId: project.id, experienceVersion: project.version, text };
    if (settings.emailNotificationsEnabled && user.email)
      await communicationQueue.enqueue({
        ...base,
        channel: 'EMAIL',
        recipient: user.email,
        key: `${key}:email`,
        payload: {
          ...payload,
          html: `<p>${escapeMessageHtml(text).replace(/\n/g, '<br>')}</p>`,
          variables: { pedido: order.orderNumber, enlace: url, mensaje: text },
        },
      });
    const phone = whatsappRecipient(user.phone);
    if (order.whatsappOptInAt && phone)
      await communicationQueue.enqueue({
        ...base,
        channel: 'WHATSAPP',
        recipient: phone,
        key: `${key}:whatsapp`,
        payload: { ...payload, kind: 'template', parameters: [order.orderNumber, url] },
      });
  },
  async transition(
    id: number,
    req: Request,
    input: { expectedVersion: number; action: 'REVIEW' | 'PUBLISH' | 'PAUSE'; startsAt?: string },
  ) {
    return sequelize.transaction(async (transaction) => {
      const { project, order } = await this.load(id, req, transaction);
      if (project.version !== input.expectedVersion)
        throw ApiError.conflict('La experiencia cambió. Actualiza la pantalla.');
      if (input.action === 'PAUSE') {
        if (project.status !== 'PUBLISHED')
          throw ApiError.conflict('Solo puedes pausar una publicación.');
        project.status = 'PAUSED';
      } else {
        if (!paymentAllows(order, project.packageSnapshotJson.paymentRequirement))
          throw ApiError.unprocessable(
            'Falta verificar el pago requerido o el pedido está cancelado.',
          );
        await this.assets(project.sceneJson, true, project.id);
        if (!project.sceneJson.videoAssetId)
          throw ApiError.badRequest('Este servicio requiere un video.');
        if (project.packageSnapshotJson.mode === 'AR' && project.sceneJson.content === 'VIDEO')
          throw ApiError.badRequest('El servicio AR requiere una escena 3D además del video.');
        if (input.action === 'REVIEW') {
          if (!['DRAFT', 'IN_PROGRESS'].includes(project.status))
            throw ApiError.conflict('Guarda una nueva versión antes de solicitar otra revisión.');
          project.status = 'AWAITING_APPROVAL';
          project.previewToken = randomBytes(24).toString('base64url');
          project.previewExpiresAt = new Date(Date.now() + 7 * 86400000);
        } else {
          if (
            (!['APPROVED', 'PAUSED'].includes(project.status) &&
              !(
                project.status === 'PUBLISHED' &&
                project.expiresAt &&
                project.expiresAt.getTime() <= Date.now()
              )) ||
            project.approvedVersion !== project.version
          )
            throw ApiError.unprocessable(
              'El cliente debe aprobar esta versión antes de publicarla.',
            );
          const starts = input.startsAt ? new Date(input.startsAt) : new Date();
          if (!Number.isFinite(starts.getTime())) throw ApiError.badRequest('Fecha inválida.');
          if (
            starts.getTime() < Date.now() - 300000 ||
            starts.getTime() > Date.now() + 365 * 86400000
          )
            throw ApiError.badRequest(
              'Programa la publicación desde hoy y dentro del próximo año.',
            );
          project.startsAt = starts;
          project.expiresAt = new Date(
            starts.getTime() + project.packageSnapshotJson.validityDays * 86400000,
          );
          project.publishedSceneJson = project.sceneJson;
          project.status = 'PUBLISHED';
        }
      }
      await project.save({ transaction });
      await event(
        project,
        req.user!.sub,
        input.action,
        input.action === 'PUBLISH' ? `Vigencia hasta ${project.expiresAt?.toISOString()}` : '',
        transaction,
      );
      if (input.action !== 'PAUSE')
        await this.notify(project, order, input.action === 'PUBLISH', transaction);
      return project;
    });
  },
  async review(
    orderNumber: string,
    userId: number,
    input: { expectedVersion: number; approve: boolean; feedback: string },
  ) {
    return sequelize.transaction(async (transaction) => {
      const { project } = await this.customer(orderNumber, userId, transaction);
      if (
        !project ||
        project.status !== 'AWAITING_APPROVAL' ||
        project.version !== input.expectedVersion ||
        !project.previewExpiresAt ||
        project.previewExpiresAt.getTime() <= Date.now()
      )
        throw ApiError.conflict('Esta propuesta cambió o venció. Solicita una nueva revisión.');
      if (!input.approve && !input.feedback.trim())
        throw ApiError.badRequest('Describe los cambios que necesitas.');
      if (!input.approve && project.revisionsUsed >= project.packageSnapshotJson.revisionsIncluded)
        throw ApiError.unprocessable(
          'Ya utilizaste las revisiones incluidas. Contacta con la tienda para coordinar otra.',
        );
      project.status = input.approve ? 'APPROVED' : 'IN_PROGRESS';
      project.approvedVersion = input.approve ? project.version : null;
      project.customerFeedback = input.feedback;
      if (!input.approve) {
        project.revisionsUsed++;
        project.previewToken = null;
        project.previewExpiresAt = null;
      }
      await project.save({ transaction });
      await event(
        project,
        userId,
        input.approve ? 'APPROVED' : 'CHANGES_REQUESTED',
        input.feedback,
        transaction,
      );
      return project;
    });
  },
  async public(token: string) {
    const project = await ExperienceProject.findOne({ where: { publicToken: token } });
    const order = project ? await Order.findByPk(project.orderId) : null;
    if (
      !project ||
      !order ||
      !project.publishedSceneJson ||
      !publicExperienceAvailable(project, order, project.packageSnapshotJson.paymentRequirement)
    )
      throw ApiError.notFound('Esta experiencia no está publicada o su enlace venció.');
    return project;
  },
};
