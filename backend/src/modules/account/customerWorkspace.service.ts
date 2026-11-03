import { engagementService } from '@modules/engagement/engagement.service';
import { ProductFavorite, Product } from '@database/models';
import { createHash, randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { z } from 'zod';
import { CustomerWorkspace, CustomerMedia } from '@database/models/customerJourney.model';
import { User, sequelize } from '@database/models';
import { decodeCakeOrderReference } from '@modules/cakes/cakeOrderReference';
import { ApiError } from '@shared/errors/ApiError';

export const workspaceSchema = z
  .object({
    revision: z.number().int().positive(),
    cart: z.array(z.record(z.unknown())).max(30),
    favorites: z.array(z.record(z.unknown())).max(200),
    drafts: z.record(z.unknown()),
  })
  .refine(
    (input) => Buffer.byteLength(JSON.stringify(input)) <= 1_500_000,
    'El borrador es demasiado grande. Guarda las imágenes como adjuntos.',
  );
export const channelsSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  push: z.boolean(),
});
const dto = (row: CustomerWorkspace) => ({
  revision: row.revision,
  cart: row.cartJson,
  favorites: row.favoritesJson,
  drafts: row.draftsJson,
  channels: row.channelsJson,
  updatedAt: row.updatedAt,
});
export const customerWorkspaceService = {
  async get(userId: number) {
    const [row] = await CustomerWorkspace.findOrCreate({ where: { userId }, defaults: { userId } });
    const products = await engagementService.listFavorites(userId);
    return {
      ...dto(row),
      favorites: products.map((product) => ({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        imageUrl: product.imageUrl,
        priceFrom: product.priceFrom,
        type: product.type,
      })),
    };
  },
  async save(userId: number, raw: z.infer<typeof workspaceSchema>) {
    const input = workspaceSchema.parse(raw);
    return sequelize.transaction(async (transaction) => {
      const row = await CustomerWorkspace.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row || row.revision !== input.revision)
        throw ApiError.conflict(
          'Tu carrito cambió en otro dispositivo. Recarga la versión guardada antes de reemplazarla.',
        );
      // Media identifiers can never grant access to another customer's uploads.
      const serialized = JSON.stringify(input);
      const ids = [
        ...new Set(
          serialized.match(
            /[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/gi,
          ) ?? [],
        ),
      ];
      const referenced = await CustomerMedia.findAll({
        where: { id: ids },
        attributes: ['id', 'userId'],
        transaction,
      });
      if (referenced.some((media) => media.userId !== userId))
        throw ApiError.forbidden('Un adjunto no pertenece a esta cuenta.');
      const productIds = input.favorites
        .map((item) => Number(item.productId))
        .filter((id) => Number.isInteger(id) && id > 0);
      const products = await Product.findAll({
        where: { id: productIds, status: 'ACTIVE' },
        attributes: ['id'],
        transaction,
      });
      const validIds = products.map((product) => product.id);
      await ProductFavorite.destroy({
        where: { userId, productId: { [Op.notIn]: validIds } },
        transaction,
      });
      for (const productId of validIds)
        await ProductFavorite.findOrCreate({
          where: { userId, productId },
          defaults: { userId, productId },
          transaction,
        });
      await row.update(
        {
          cartJson: input.cart,
          favoritesJson: input.favorites,
          draftsJson: input.drafts,
          revision: row.revision + 1,
        },
        { transaction },
      );
      await CustomerMedia.destroy({
        where: {
          userId,
          id: { [Op.notIn]: referenced.map((media) => media.id) },
          updatedAt: { [Op.lt]: new Date(Date.now() - 30 * 86_400_000) },
        },
        transaction,
      });
      return dto(row);
    });
  },
  async upload(userId: number, dataUrl: string) {
    const image = decodeCakeOrderReference(dataUrl);
    const hash = createHash('sha256').update(image.bytes).digest('hex');
    return sequelize.transaction(async (transaction) => {
      await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      const found = await CustomerMedia.findOne({ where: { userId, hash }, transaction });
      if (found) return { mediaId: found.id };
      if ((await CustomerMedia.count({ where: { userId }, transaction })) >= 150)
        throw ApiError.unprocessable(
          'Llegaste al límite de adjuntos guardados. Elimina borradores antiguos antes de subir más.',
        );
      const row = await CustomerMedia.create(
        { id: randomUUID(), userId, hash, ...image },
        { transaction },
      );
      return { mediaId: row.id };
    });
  },
  async media(userId: number, id: string) {
    const row = await CustomerMedia.findOne({ where: { id, userId } });
    if (!row) throw ApiError.notFound('Adjunto no encontrado');
    return { dataUrl: `data:${row.mime};base64,${row.bytes.toString('base64')}` };
  },
  async channels(userId: number, input: z.infer<typeof channelsSchema>) {
    await customerWorkspaceService.get(userId);
    await CustomerWorkspace.update(
      { channelsJson: channelsSchema.parse(input) },
      { where: { userId } },
    );
    return input;
  },
};
