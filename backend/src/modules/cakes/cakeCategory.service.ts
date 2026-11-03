import { Category } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

export const cakeCategoryService = {
  async listActive() {
    return Category.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'slug'],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
  },

  async requireActive(categoryId: number) {
    const category = await Category.findOne({ where: { id: categoryId, isActive: true } });
    if (!category) throw ApiError.unprocessable('La categoría seleccionada ya no está disponible. Actualiza la lista y elige una categoría activa.');
    return category;
  },
};
