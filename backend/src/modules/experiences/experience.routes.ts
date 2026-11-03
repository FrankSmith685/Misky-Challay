import { createHash } from 'node:crypto';
import { Router, raw, type Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { PERMISSIONS as P } from '@config/constants';
import { sequelize, Order, User } from '@database/models';
import {
  ExperienceAsset,
  ExperienceEvent,
  ExperiencePackage,
  ExperienceProject,
  ExperienceTemplate,
} from '@database/models/experience.model';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { ApiError } from '@shared/errors/ApiError';
import { staffAudienceService } from '@modules/notifications/staffAudience.service';
import { ok } from '@shared/http/ApiResponse';
import {
  packageSchema,
  sceneSchema,
  sceneAssetIds,
  validateAsset,
  publicExperienceAvailable,
} from './experience.logic';
import { experienceService as service } from './experience.service';

const router = Router();
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const version = z.number().int().positive();
const read = requireAnyPermission(P.EXPERIENCE_READ, P.EXPERIENCE_WRITE, P.EXPERIENCE_PUBLISH);
const write = requirePermissions(P.EXPERIENCE_WRITE);
const globalOnly = (req: import('express').Request) => {
  if (!req.user?.isSuperAdmin && req.user?.branchIds?.length)
    throw ApiError.forbidden('La configuración de servicios y archivos requiere alcance global.');
};
const binary = (res: Response, asset: ExperienceAsset, range?: string) => {
  const bytes = asset.bytes;
  res.set({
    'Content-Type': asset.mime,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
  });
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : -1;
    const end = match?.[2] ? Number(match[2]) : bytes.length - 1;
    if (start < 0 || start > end || end >= bytes.length) {
      res.status(416).set('Content-Range', `bytes */${bytes.length}`).end();
      return;
    }
    res
      .status(206)
      .set('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
      .send(bytes.subarray(start, end + 1));
    return;
  }
  res.send(bytes);
};
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get(
  '/packages',
  asyncHandler(async (_req, res) =>
    ok(
      res,
      await ExperiencePackage.findAll({
        where: { isActive: true, price: { [Op.gt]: 0 } },
        order: [
          ['sortOrder', 'ASC'],
          ['id', 'ASC'],
        ],
      }),
    ),
  ),
);
router.get(
  '/public/:token',
  asyncHandler(async (req, res) => {
    const project = await service.public(
      z
        .string()
        .regex(/^[\w-]{32}$/)
        .parse(req.params.token),
    );
    return ok(res, { scene: project.publishedSceneJson, expiresAt: project.expiresAt });
  }),
);
router.get(
  '/public/:token/assets/:id',
  asyncHandler(async (req, res) => {
    const project = await service.public(
      z
        .string()
        .regex(/^[\w-]{32}$/)
        .parse(req.params.token),
    );
    const assetId = id(req.params.id);
    if (!sceneAssetIds(project.publishedSceneJson!).includes(assetId)) throw ApiError.notFound();
    const asset = await ExperienceAsset.findByPk(assetId);
    if (!asset) throw ApiError.notFound();
    binary(res, asset, req.headers.range);
  }),
);
router.use(authenticate);
router.get(
  '/orders/:number',
  asyncHandler(async (req, res) => {
    const { project, order } = await service.customer(req.params.number, req.user!.sub);
    if (!project) return ok(res, null);
    const reviewable = ['AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'PAUSED'].includes(
      project.status,
    );
    const live = publicExperienceAvailable(
      project,
      order,
      project.packageSnapshotJson.paymentRequirement,
    );
    const status =
      project.status === 'PUBLISHED' &&
      project.expiresAt &&
      project.expiresAt.getTime() <= Date.now()
        ? 'EXPIRED'
        : project.status;
    return ok(res, {
      id: project.id,
      status,
      version: project.version,
      package: project.packageSnapshotJson,
      revisionsUsed: project.revisionsUsed,
      feedback: project.customerFeedback,
      scene: reviewable ? project.sceneJson : null,
      publicToken: live ? project.publicToken : null,
      startsAt: project.startsAt,
      expiresAt: project.expiresAt,
      previewExpiresAt: project.previewExpiresAt,
    });
  }),
);
router.get(
  '/orders/:number/assets/:id',
  asyncHandler(async (req, res) => {
    const { project } = await service.customer(req.params.number, req.user!.sub);
    const assetId = id(req.params.id);
    if (
      !project ||
      !['AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'PAUSED'].includes(project.status) ||
      !sceneAssetIds(project.sceneJson).includes(assetId)
    )
      throw ApiError.notFound();
    const asset = await ExperienceAsset.findByPk(assetId);
    if (!asset) throw ApiError.notFound();
    binary(res, asset, req.headers.range);
  }),
);
router.post(
  '/orders/:number/review',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        expectedVersion: version,
        approve: z.boolean(),
        feedback: z.string().trim().max(1000).default(''),
      })
      .parse(req.body);
    return ok(res, await service.review(req.params.number, req.user!.sub, body));
  }),
);
router.get(
  '/admin/config',
  read,
  asyncHandler(async (req, res) => {
    globalOnly(req);
    return ok(res, {
      packages: await ExperiencePackage.findAll({
        order: [
          ['sortOrder', 'ASC'],
          ['id', 'ASC'],
        ],
      }),
      templates: await ExperienceTemplate.findAll({ order: [['id', 'DESC']] }),
      assets: await ExperienceAsset.findAll({
        where: { projectId: null },
        attributes: ['id', 'kind', 'name', 'size', 'sourceImageId'],
        order: [['id', 'DESC']],
        limit: 200,
      }),
    });
  }),
);
router.post(
  '/admin/packages',
  write,
  asyncHandler(async (req, res) => {
    globalOnly(req);
    const input = packageSchema.parse(req.body);
    if (input.templateId && !(await ExperienceTemplate.findByPk(input.templateId)))
      throw ApiError.badRequest('Plantilla no encontrada.');
    const pack = await sequelize.transaction(async (transaction) => {
      if (!req.body.id) return ExperiencePackage.create(input, { transaction });
      const existing = await ExperiencePackage.findByPk(id(req.body.id), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!existing || existing.version !== req.body.expectedVersion)
        throw ApiError.conflict('El servicio cambió. Actualiza la pantalla.');
      return existing.update({ ...input, version: existing.version + 1 }, { transaction });
    });
    await audit(req, {
      action: 'EXPERIENCE_PACKAGE_SAVE',
      entity: 'ExperiencePackage',
      entityId: pack.id,
    });
    return ok(res, pack);
  }),
);
router.post(
  '/admin/templates',
  write,
  asyncHandler(async (req, res) => {
    globalOnly(req);
    const input = z
      .object({
        name: z.string().trim().min(3).max(100),
        sceneJson: sceneSchema,
        isActive: z.boolean(),
      })
      .parse(req.body);
    await service.assets(input.sceneJson);
    const template = await sequelize.transaction(async (transaction) => {
      if (!req.body.id) return ExperienceTemplate.create(input, { transaction });
      const old = await ExperienceTemplate.findByPk(id(req.body.id), {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!old || old.version !== req.body.expectedVersion)
        throw ApiError.conflict('La plantilla cambió. Actualiza la pantalla.');
      return old.update({ ...input, version: old.version + 1 }, { transaction });
    });
    await audit(req, {
      action: 'EXPERIENCE_TEMPLATE_SAVE',
      entity: 'ExperienceTemplate',
      entityId: template.id,
    });
    return ok(res, template);
  }),
);
router.post(
  '/admin/assets',
  write,
  rateLimit({ windowMs: 3600000, limit: 50 }),
  raw({ type: () => true, limit: '21mb' }),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? id(req.query.projectId) : null;
    if (projectId) await service.load(projectId, req);
    else globalOnly(req);
    const kind = z.enum(['VIDEO', 'MODEL', 'AUDIO', 'IMAGE', 'TARGET']).parse(req.query.kind);
    const mime = req.headers['content-type']?.split(';')[0] ?? '';
    if (!Buffer.isBuffer(req.body)) throw ApiError.badRequest('Envía el archivo binario.');
    validateAsset(kind, mime, req.body);
    const sourceImageId = kind === 'TARGET' ? id(req.query.sourceImageId) : null;
    if (
      sourceImageId &&
      !(await ExperienceAsset.findOne({ where: { id: sourceImageId, kind: 'IMAGE', projectId } }))
    )
      throw ApiError.badRequest('Sube primero la imagen de la tarjeta.');
    const asset = await ExperienceAsset.create({
      kind,
      mime,
      name: z.string().trim().min(1).max(150).parse(req.query.name),
      bytes: req.body,
      size: req.body.length,
      sha256: createHash('sha256').update(req.body).digest('hex'),
      createdBy: req.user!.sub,
      sourceImageId,
      projectId,
    });
    return ok(res, { id: asset.id, kind, name: asset.name, size: asset.size, sourceImageId });
  }),
);
router.get(
  '/admin/assets/:id',
  read,
  asyncHandler(async (req, res) => {
    globalOnly(req);
    const asset = await ExperienceAsset.findByPk(id(req.params.id));
    if (!asset) throw ApiError.notFound();
    if (asset.projectId) await service.load(asset.projectId, req);
    binary(res, asset, req.headers.range);
  }),
);
router.get(
  '/admin/projects',
  read,
  asyncHandler(async (req, res) => {
    const scope =
      !req.user?.isSuperAdmin && req.user?.branchIds?.length
        ? { branchId: { [Op.in]: req.user.branchIds } }
        : {};
    const projects = await ExperienceProject.findAll({
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['orderNumber', 'branchId', 'status', 'depositPaidAt', 'balancePaidAt'],
          where: scope,
        },
      ],
      order: [['id', 'DESC']],
      limit: 200,
    });
    return ok(res, projects);
  }),
);
router.get(
  '/admin/projects/:id',
  read,
  asyncHandler(async (req, res) => {
    const { project, order } = await service.load(id(req.params.id), req);
    const history = await ExperienceEvent.findAll({
      where: { projectId: project.id },
      order: [['id', 'DESC']],
      limit: 100,
    });
    return ok(res, {
      project,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        depositPaidAt: order.depositPaidAt,
        balancePaidAt: order.balancePaidAt,
      },
      history,
      staff: await User.findAll({
        where: {
          id: { [Op.in]: await staffAudienceService.userIds(order.branchId, P.EXPERIENCE_WRITE) },
        },
        attributes: ['id', 'firstName', 'lastName'],
      }),
      assets: await ExperienceAsset.findAll({
        where: { [Op.or]: [{ projectId: project.id }, { projectId: null }] },
        attributes: ['id', 'kind', 'name', 'size', 'sourceImageId'],
        order: [['id', 'DESC']],
        limit: 200,
      }),
    });
  }),
);
router.get(
  '/admin/projects/:id/assets/:assetId',
  read,
  asyncHandler(async (req, res) => {
    const { project } = await service.load(id(req.params.id), req);
    const assetId = id(req.params.assetId);
    if (!sceneAssetIds(project.sceneJson).includes(assetId)) throw ApiError.notFound();
    const asset = await ExperienceAsset.findByPk(assetId);
    if (!asset) throw ApiError.notFound();
    binary(res, asset, req.headers.range);
  }),
);
router.post(
  '/admin/projects/:id',
  write,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        expectedVersion: version,
        scene: sceneSchema,
        assignedTo: z.number().int().positive().nullable().default(null),
      })
      .parse(req.body);
    const project = await sequelize.transaction(async (transaction) => {
      const { project, order } = await service.load(id(req.params.id), req, transaction);
      await service.assets(input.scene, false, project.id);
      if (
        input.assignedTo &&
        !(await staffAudienceService.userIds(order.branchId, P.EXPERIENCE_WRITE)).includes(
          input.assignedTo,
        )
      )
        throw ApiError.badRequest('El responsable necesita acceso de creación en esta sede.');
      if (project.version !== input.expectedVersion)
        throw ApiError.conflict('La experiencia cambió. Actualiza la pantalla.');
      await project.update(
        {
          sceneJson: input.scene,
          assignedTo: input.assignedTo,
          status: 'IN_PROGRESS',
          version: project.version + 1,
          approvedVersion: null,
          previewToken: null,
          previewExpiresAt: null,
        },
        { transaction },
      );
      await ExperienceEvent.create(
        {
          projectId: project.id,
          actorId: req.user!.sub,
          version: project.version,
          action: 'EDITED',
          note: 'Nueva versión; requiere aprobación.',
        },
        { transaction },
      );
      return project;
    });
    await audit(req, {
      action: 'EXPERIENCE_EDIT',
      entity: 'ExperienceProject',
      entityId: project.id,
    });
    return ok(res, project);
  }),
);
router.post(
  '/admin/projects/:id/action',
  asyncHandler(async (req, res, next) => {
    const input = z
      .object({
        expectedVersion: version,
        action: z.enum(['REVIEW', 'PUBLISH', 'PAUSE']),
        startsAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const permission = input.action === 'REVIEW' ? P.EXPERIENCE_WRITE : P.EXPERIENCE_PUBLISH;
    requirePermissions(permission)(req, res, (error) =>
      error
        ? next(error)
        : void (async () => {
            try {
              const project = await service.transition(id(req.params.id), req, input);
              await audit(req, {
                action: `EXPERIENCE_${input.action}`,
                entity: 'ExperienceProject',
                entityId: project.id,
              });
              ok(res, project);
            } catch (e) {
              next(e);
            }
          })(),
    );
  }),
);
export default router;
