import { QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const STANDARD_CATEGORIES = [
  {
    name: 'Tortas',
    slug: 'tortas',
    description: 'Tortas clásicas y personalizables para celebrar.',
    imageUrl: '/images/categories/promo-tortas.jpg',
    sortOrder: 10,
  },
  {
    name: 'Tortas 24 horas',
    slug: 'tortas-24-horas',
    description: 'Tortas listas para reservar con anticipación.',
    imageUrl: '/images/categories/promo-tortas-24-horas.jpg',
    sortOrder: 20,
  },
  {
    name: 'Postres',
    slug: 'postres',
    description: 'Postres y porciones listas para disfrutar.',
    imageUrl: '/images/categories/promo-postres.jpg',
    sortOrder: 30,
  },
  {
    name: 'Turrones',
    slug: 'turrones',
    description: 'Turrones para compartir y regalar.',
    imageUrl: '/images/categories/promo-turrones.jpg',
    sortOrder: 40,
  },
  {
    name: 'Kekes',
    slug: 'kekes',
    description: 'Kekes artesanales para compartir.',
    imageUrl: '/images/cakes/vanilla.svg',
    sortOrder: 50,
  },
  {
    name: 'Bocaditos',
    slug: 'bocaditos',
    description: 'Cajas y combos listos para compartir.',
    imageUrl: '/images/categories/promo-bocaditos.jpg',
    sortOrder: 60,
  },
  {
    name: 'Fatias',
    slug: 'fatias',
    description: 'Porciones y fatias para disfrutar hoy.',
    imageUrl: '/images/pastry/fatia-chocolate.svg',
    sortOrder: 70,
  },
] as const;

/** Estandariza las categorías raíz visibles y agrega las que faltaban. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const category of STANDARD_CATEGORIES) {
    const rows = await q.sequelize.query<{ id: number; image_url: string | null }>(
      'SELECT id, image_url FROM categories WHERE slug = :slug LIMIT 1',
      { replacements: { slug: category.slug }, type: QueryTypes.SELECT },
    );

    if (rows.length > 0) {
      await q.sequelize.query(
        `UPDATE categories
         SET name = :name,
             description = COALESCE(description, :description),
             image_url = COALESCE(image_url, :imageUrl),
             parent_id = NULL,
             sort_order = :sortOrder,
             is_active = 1,
             deleted_at = NULL,
             updated_at = NOW()
         WHERE id = :id`,
        { replacements: { ...category, id: rows[0].id } },
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

export const down = async (): Promise<void> => undefined;
