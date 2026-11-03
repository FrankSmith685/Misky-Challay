import { Allergen, DietaryTag } from '../models';

// Opciones de clasificación. Ninguna se asigna automáticamente a un producto.
const allergens = [
  { code: 'gluten', name: 'Gluten' },
  { code: 'lacteos', name: 'Lácteos' },
  { code: 'huevo', name: 'Huevo' },
  { code: 'mani', name: 'Maní' },
  { code: 'frutos-secos', name: 'Frutos secos' },
  { code: 'soya', name: 'Soya' },
  { code: 'sesamo', name: 'Sésamo' },
  // Puede estar presente en frutas confitadas, pulpas y decoraciones conservadas.
  { code: 'sulfitos', name: 'Sulfitos' },
  { code: 'pescado', name: 'Pescado' },
  { code: 'mariscos', name: 'Mariscos' },
];

const dietaryTags = [
  { code: 'sin-azucar', name: 'Sin azúcar', color: '#237c52' },
  { code: 'vegano', name: 'Vegano', color: '#237c52' },
  { code: 'vegetariano', name: 'Vegetariano', color: '#5ab585' },
  { code: 'sin-gluten', name: 'Sin gluten', color: '#369a68' },
];

export const ensureAllergenOptions = async (): Promise<void> => {
  for (const allergen of allergens) {
    await Allergen.findOrCreate({ where: { code: allergen.code }, defaults: allergen });
  }
};

export const seedFoodTaxonomy = async (): Promise<void> => {
  await ensureAllergenOptions();
  for (const tag of dietaryTags) {
    await DietaryTag.findOrCreate({ where: { code: tag.code }, defaults: tag });
  }
};
