import { Op } from 'sequelize';
import {
  NewsletterSubscription,
  Order,
  OrderItem,
  Product,
  ProductFavorite,
  ProductReview,
  User,
  UserPreference,
} from '@database/models';
import { ORDER_STATUS } from '@config/constants';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { NEWSLETTER_STATUS } from '@database/models/newsletterSubscription.model';
import { REVIEW_STATUS } from '@database/models/productReview.model';
import { catalogService } from '@modules/catalog/catalog.service';
import { ApiError } from '@shared/errors/ApiError';
import { buildMeta, getPagination } from '@shared/utils/pagination';
import type { CreateReviewInput, UpdateReviewInput } from './engagement.validation';

const normalizeComment = (value?: string | null) => value?.trim() || null;

/** Regla pura de RN-020 para poder verificarla sin depender de la base de datos. */
export const reviewEligibility = (orderUserId: number | null, currentUserId: number, orderStatus: string, productId: number | null) => {
  if (!productId) return 'NO_PRODUCT' as const;
  if (orderUserId !== currentUserId) return 'NOT_OWNED' as const;
  if (orderStatus !== ORDER_STATUS.DELIVERED) return 'NOT_DELIVERED' as const;
  return 'ELIGIBLE' as const;
};

export const engagementService = {
  async listFavorites(userId: number, branchId?: number) {
    const favorites = await ProductFavorite.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    if (!favorites.length) return [];
    const products = await catalogService.listProducts({ branchId });
    const byId = new Map(products.map((product) => [product.id, product]));
    return favorites.map((favorite) => byId.get(favorite.productId)).filter((product) => product !== undefined);
  },

  async addFavorite(userId: number, productId: number) {
    const product = await Product.findOne({ where: { id: productId, status: PRODUCT_STATUS.ACTIVE } });
    if (!product) throw ApiError.notFound('El producto no existe o ya no está publicado');
    const [favorite, created] = await ProductFavorite.findOrCreate({ where: { userId, productId }, defaults: { userId, productId } });
    return { productId: favorite.productId, created };
  },

  async removeFavorite(userId: number, productId: number) {
    const removed = await ProductFavorite.destroy({ where: { userId, productId } });
    return { productId, removed: removed > 0 };
  },

  async listProductReviews(productId: number, page: number, pageSize: number) {
    const product = await Product.findOne({ where: { id: productId, status: PRODUCT_STATUS.ACTIVE }, attributes: ['id'] });
    if (!product) throw ApiError.notFound('Producto no encontrado');
    const where = { productId, status: REVIEW_STATUS.PUBLISHED };
    const pagination = getPagination({ page, pageSize });
    const { offset, limit } = pagination;
    const { rows, count } = await ProductReview.findAndCountAll({ where, order: [['createdAt', 'DESC']], offset, limit });
    const allRatings = await ProductReview.findAll({ where, attributes: ['rating'] });
    const average = allRatings.length ? allRatings.reduce((sum, row) => sum + row.rating, 0) / allRatings.length : 0;
    const users = await User.findAll({ where: { id: { [Op.in]: [...new Set(rows.map((row) => row.userId))] } }, attributes: ['id', 'firstName'] });
    const names = new Map(users.map((user) => [user.id, user.firstName || 'Cliente Verde Bowl']));
    return {
      summary: { average: Number(average.toFixed(1)), count: allRatings.length },
      reviews: rows.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment, verifiedPurchase: review.verifiedPurchase, authorName: names.get(review.userId) ?? 'Cliente Verde Bowl', createdAt: review.createdAt })),
      meta: buildMeta(pagination, count),
    };
  },

  async pendingReviews(userId: number) {
    const orders = await Order.findAll({ where: { userId, status: ORDER_STATUS.DELIVERED }, attributes: ['id', 'orderNumber', 'deliveredAt'], order: [['deliveredAt', 'DESC']], limit: 50 });
    if (!orders.length) return [];
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const items = await OrderItem.findAll({ where: { orderId: { [Op.in]: orders.map((order) => order.id) }, productId: { [Op.not]: null } }, order: [['createdAt', 'DESC']] });
    const reviewed = await ProductReview.findAll({ where: { orderItemId: { [Op.in]: items.map((item) => item.id) } }, attributes: ['orderItemId'] });
    const reviewedIds = new Set(reviewed.map((review) => review.orderItemId));
    const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is number => id !== null))];
    const products = await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ['id', 'slug', 'imageUrl'] });
    const productsById = new Map(products.map((product) => [product.id, product]));
    return items.filter((item) => !reviewedIds.has(item.id)).map((item) => {
      const order = orderById.get(item.orderId); const product = item.productId ? productsById.get(item.productId) : null;
      return { orderItemId: item.id, orderNumber: order?.orderNumber ?? '', deliveredAt: order?.deliveredAt ?? null, productId: item.productId, productName: item.productNameSnapshot, productSlug: product?.slug ?? null, imageUrl: product?.imageUrl ?? null };
    });
  },

  async createReview(userId: number, input: CreateReviewInput) {
    const item = await OrderItem.findByPk(input.orderItemId);
    if (!item) throw ApiError.notFound('Producto del pedido no encontrado');
    const order = await Order.findByPk(item.orderId);
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    const eligibility = reviewEligibility(order.userId, userId, order.status, item.productId);
    if (eligibility === 'NO_PRODUCT') throw ApiError.notFound('Producto del pedido no encontrado');
    if (eligibility === 'NOT_OWNED') throw ApiError.forbidden('Ese producto no pertenece a tu cuenta');
    if (eligibility === 'NOT_DELIVERED') throw ApiError.unprocessable('Solo puedes reseñar productos de pedidos entregados');
    const existing = await ProductReview.findOne({ where: { orderItemId: item.id } });
    if (existing) throw ApiError.conflict('Este producto del pedido ya tiene una reseña');
    return ProductReview.create({ userId, productId: item.productId!, orderItemId: item.id, rating: input.rating, comment: normalizeComment(input.comment), status: REVIEW_STATUS.PUBLISHED, verifiedPurchase: true });
  },

  async updateReview(userId: number, reviewId: number, input: UpdateReviewInput) {
    const review = await ProductReview.findOne({ where: { id: reviewId, userId } });
    if (!review) throw ApiError.notFound('Reseña no encontrada');
    return review.update({ rating: input.rating, comment: normalizeComment(input.comment) });
  },

  async newsletterStatus(userId: number) {
    const user = await User.findByPk(userId, { attributes: ['email'] });
    if (!user?.email) return { subscribed: false, email: null };
    const row = await NewsletterSubscription.findOne({ where: { email: user.email.toLowerCase() } });
    return { subscribed: row?.status === NEWSLETTER_STATUS.SUBSCRIBED, email: user.email };
  },

  async setNewsletter(userId: number, subscribed: boolean, source: 'WEB' | 'MOBILE') {
    const user = await User.findByPk(userId, { attributes: ['id', 'email'] });
    if (!user?.email) throw ApiError.unprocessable('Tu cuenta necesita un correo para recibir novedades');
    const email = user.email.toLowerCase(); const now = new Date();
    const [row] = await NewsletterSubscription.findOrCreate({ where: { email }, defaults: { userId, email, source, status: subscribed ? NEWSLETTER_STATUS.SUBSCRIBED : NEWSLETTER_STATUS.UNSUBSCRIBED, subscribedAt: subscribed ? now : null, unsubscribedAt: subscribed ? null : now } });
    await row.update({ userId, source, status: subscribed ? NEWSLETTER_STATUS.SUBSCRIBED : NEWSLETTER_STATUS.UNSUBSCRIBED, subscribedAt: subscribed ? now : row.subscribedAt, unsubscribedAt: subscribed ? null : now });
    return { subscribed, email };
  },

  async recommendations(userId: number | null, branchId: number | undefined, limit: number) {
    const preferences = userId ? await UserPreference.findOne({ where: { userId } }) : null;
    const products = await catalogService.listProducts({ branchId, excludeAllergens: preferences?.allergens ?? [] });
    const available = products.filter((product) => product.isAvailable);
    const favorites = userId ? await ProductFavorite.findAll({ where: { userId }, attributes: ['productId'] }) : [];
    const favoriteIds = new Set(favorites.map((favorite) => favorite.productId));
    const orders = userId ? await Order.findAll({ where: { userId, status: ORDER_STATUS.DELIVERED }, attributes: ['id'], order: [['deliveredAt', 'DESC']], limit: 50 }) : [];
    const items = orders.length ? await OrderItem.findAll({ where: { orderId: { [Op.in]: orders.map((order) => order.id) }, productId: { [Op.not]: null } }, attributes: ['productId'] }) : [];
    const ordered = new Map<number, number>();
    items.forEach((item) => { if (item.productId) ordered.set(item.productId, (ordered.get(item.productId) ?? 0) + 1); });
    const preferredTags = new Set(preferences?.dietaryTags ?? []);
    return available.map((product) => {
      const favorite = favoriteIds.has(product.id); const repeats = ordered.get(product.id) ?? 0; const preferenceMatches = product.dietaryTags.filter((tag) => preferredTags.has(tag)).length;
      const score = (favorite ? 80 : 0) + repeats * 22 + preferenceMatches * 10 + (product.isFeatured ? 8 : 0);
      const reason = favorite ? 'Uno de tus favoritos' : repeats ? 'Ya lo disfrutaste antes' : preferenceMatches ? 'Va con tus preferencias' : 'Recomendado por Verde Bowl';
      return { product, reason, score };
    }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)).slice(0, limit).map(({ product, reason }) => ({ product, reason }));
  },
};

export type EngagementService = typeof engagementService;
