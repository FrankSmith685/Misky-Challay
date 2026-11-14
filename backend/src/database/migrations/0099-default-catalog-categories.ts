import { QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const DEFAULT_CATEGORIES = [
  {
    name: 'Tortas',
    slug: 'tortas',
    description: 'Tortas clásicas, personalizables y de diseño especial.',
    imageUrl: '/images/categories/promo-tortas.jpg',
    legacyImageUrls: ['/images/cakes/custom.png'],
    sortOrder: 10,
  },
  {
    name: 'Tortas 24 horas',
    slug: 'tortas-24-horas',
    description: 'Tortas listas para reservar con anticipación.',
    imageUrl: '/images/categories/promo-tortas-24-horas.jpg',
    legacyImageUrls: ['/images/pastry/torta-chocolate.svg'],
    sortOrder: 20,
  },
  {
    name: 'Postres',
    slug: 'postres',
    description: 'Postres y porciones listas para disfrutar.',
    imageUrl: '/images/categories/promo-postres.jpg',
    legacyImageUrls: ['/images/pastry/fatia-tiramisu.svg'],
    sortOrder: 30,
  },
  {
    name: 'Turrones',
    slug: 'turrones',
    description: 'Turrones para compartir y regalar.',
    imageUrl: '/images/categories/promo-turrones.jpg',
    legacyImageUrls: ['/images/pastry/turron-dona-pepa.svg'],
    sortOrder: 40,
  },
  {
    name: 'Bocaditos',
    slug: 'bocaditos',
    description: 'Cajas y combos para compartir.',
    imageUrl: '/images/categories/promo-bocaditos.jpg',
    legacyImageUrls: ['/images/pastry/mini-alfajores.svg'],
    sortOrder: 50,
  },
] as const;

/** Deja las categorías base disponibles incluso sin activar el catálogo demo. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const category of DEFAULT_CATEGORIES) {
    const rows = await q.sequelize.query<{ id: number; image_url: string | null; deleted_at: Date | null; is_active: boolean }>(
      'SELECT id, image_url, deleted_at, is_active FROM categories WHERE slug = :slug LIMIT 1',
      { replacements: { slug: category.slug }, type: QueryTypes.SELECT },
    );

    if (rows.length > 0) {
      await q.sequelize.query(
        `UPDATE categories
         SET description = COALESCE(description, :description),
             image_url = :imageUrl,
             is_active = :isActive,
             deleted_at = :deletedAt,
             updated_at = NOW()
         WHERE id = :id`,
        {
          replacements: {
            description: category.description,
            imageUrl: rows[0].image_url && !(category.legacyImageUrls as readonly string[]).includes(rows[0].image_url)
              ? rows[0].image_url
              : category.imageUrl,
            isActive: rows[0].deleted_at ? true : rows[0].is_active,
            deletedAt: rows[0].deleted_at ? null : rows[0].deleted_at,
            id: rows[0].id,
          },
        },
      );
      continue;
    }

    await q.bulkInsert('categories', [{
      name: category.name,
      slug: category.slug,
      description: category.description,
      image_url: category.imageUrl,
      parent_id: null,
      sort_order: category.sortOrder,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }]);
  }
};

/** Las categorías base se conservan para no romper productos ni pedidos existentes. */
export const down = async (): Promise<void> => undefined;
