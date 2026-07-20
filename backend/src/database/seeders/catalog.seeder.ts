import { logger } from '@config/logger';
import { PRODUCT_TYPE } from '@config/constants';
import {
  Allergen,
  BuilderPreset,
  BuilderPresetItem,
  Category,
  CustomizationGroup,
  CustomizationOption,
  DietaryTag,
  OptionIncompatibility,
  Product,
  ProductAllergen,
  ProductCustomizationGroup,
  ProductDietaryTag,
  ProductNutrition,
  ProductVariant,
} from '../models';
import { SELECTION_TYPE } from '../models/customizationGroup.model';

/**
 * CATALOGO DE EJEMPLO
 * -------------------------------------------------------------------------
 * Datos realistas para trabajar mientras se define el catalogo real.
 * Todo esto se administra despues desde el panel sin tocar codigo.
 * Nutricion cargada a mano (decision de Fase 0).
 * Idempotente: se puede reejecutar sin duplicar.
 */

const CATEGORIES = [
  { slug: 'bowls', name: 'Bowls', sortOrder: 1 },
  { slug: 'wraps', name: 'Wraps', sortOrder: 2 },
  { slug: 'entrantes', name: 'Entrantes', sortOrder: 3 },
  { slug: 'postres', name: 'Postres', sortOrder: 4 },
  { slug: 'bebidas', name: 'Bebidas', sortOrder: 5 },
];

const ALLERGENS = [
  { code: 'gluten', name: 'Gluten' },
  { code: 'lacteos', name: 'Lacteos' },
  { code: 'pescado', name: 'Pescado' },
  { code: 'mariscos', name: 'Mariscos' },
  { code: 'frutos-secos', name: 'Frutos secos' },
  { code: 'soya', name: 'Soya' },
  { code: 'huevo', name: 'Huevo' },
  { code: 'sesamo', name: 'Sesamo' },
];

const DIETARY_TAGS = [
  { code: 'vegano', name: 'Vegano', color: '#237c52' },
  { code: 'vegetariano', name: 'Vegetariano', color: '#5ab585' },
  { code: 'alto-en-proteina', name: 'Alto en proteina', color: '#e8940f' },
  { code: 'sin-gluten', name: 'Sin gluten', color: '#369a68' },
  { code: 'bajo-en-calorias', name: 'Bajo en calorias', color: '#8ed1ac' },
];

interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

interface SeedVariant {
  name: string;
  sku: string;
  basePrice: number;
  isDefault?: boolean;
  nutrition: Nutrition;
}

interface SeedProduct {
  slug: string;
  name: string;
  category: string;
  type: 'FIXED' | 'CUSTOMIZABLE';
  description: string;
  isFeatured?: boolean;
  tags: string[];
  allergens: string[];
  variants: SeedVariant[];
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'arma-tu-bowl',
    name: 'Arma tu bowl',
    category: 'bowls',
    type: 'CUSTOMIZABLE',
    description:
      'Elige base, proteina, salsa y toppings. El precio y las calorias se actualizan mientras construyes.',
    isFeatured: true,
    tags: [],
    allergens: [],
    variants: [
      {
        name: 'Regular',
        sku: 'BOWL-CUSTOM-R',
        basePrice: 24.9,
        isDefault: true,
        nutrition: { calories: 180, protein: 5, carbs: 30, fat: 3, fiber: 4, sodium: 120 },
      },
      {
        name: 'Grande',
        sku: 'BOWL-CUSTOM-G',
        basePrice: 30.9,
        nutrition: { calories: 260, protein: 7, carbs: 45, fat: 4, fiber: 6, sodium: 160 },
      },
    ],
  },
  {
    slug: 'poke-clasico-salmon',
    name: 'Poke clasico de salmon',
    category: 'bowls',
    type: 'FIXED',
    description: 'Arroz de sushi, salmon fresco, palta, edamame, algas wakame y salsa ponzu.',
    isFeatured: true,
    tags: ['alto-en-proteina'],
    allergens: ['pescado', 'soya', 'sesamo'],
    variants: [
      {
        name: 'Regular',
        sku: 'BOWL-POKE-SALMON-R',
        basePrice: 32.9,
        isDefault: true,
        nutrition: { calories: 620, protein: 34, carbs: 68, fat: 22, fiber: 6, sodium: 780 },
      },
    ],
  },
  {
    slug: 'bowl-pollo-teriyaki',
    name: 'Bowl de pollo teriyaki',
    category: 'bowls',
    type: 'FIXED',
    description: 'Arroz integral, pollo grillado en teriyaki, brocoli, zanahoria y ajonjoli.',
    isFeatured: true,
    tags: ['alto-en-proteina'],
    allergens: ['soya', 'sesamo', 'gluten'],
    variants: [
      {
        name: 'Regular',
        sku: 'BOWL-TERIYAKI-R',
        basePrice: 28.9,
        isDefault: true,
        nutrition: { calories: 580, protein: 38, carbs: 62, fat: 16, fiber: 7, sodium: 850 },
      },
    ],
  },
  {
    slug: 'bowl-vegano-quinoa',
    name: 'Bowl vegano de quinoa',
    category: 'bowls',
    type: 'FIXED',
    description: 'Quinoa, garbanzos especiados, camote al horno, kale, palta y hummus.',
    tags: ['vegano', 'vegetariano', 'sin-gluten'],
    allergens: ['sesamo'],
    variants: [
      {
        name: 'Regular',
        sku: 'BOWL-QUINOA-R',
        basePrice: 27.9,
        isDefault: true,
        nutrition: { calories: 520, protein: 18, carbs: 72, fat: 17, fiber: 12, sodium: 480 },
      },
    ],
  },
  {
    slug: 'bowl-mediterraneo',
    name: 'Bowl mediterraneo',
    category: 'bowls',
    type: 'FIXED',
    description: 'Cuscus integral, pollo, tomate cherry, pepino, aceitunas y yogurt griego.',
    tags: ['alto-en-proteina'],
    allergens: ['gluten', 'lacteos'],
    variants: [
      {
        name: 'Regular',
        sku: 'BOWL-MEDIT-R',
        basePrice: 29.9,
        isDefault: true,
        nutrition: { calories: 560, protein: 32, carbs: 58, fat: 20, fiber: 8, sodium: 690 },
      },
    ],
  },
  {
    slug: 'wrap-de-pollo',
    name: 'Wrap de pollo',
    category: 'wraps',
    type: 'FIXED',
    description: 'Tortilla integral, pollo grillado, palta, lechuga y salsa de yogurt.',
    tags: ['alto-en-proteina'],
    allergens: ['gluten', 'lacteos'],
    variants: [
      {
        name: 'Unico',
        sku: 'WRAP-POLLO',
        basePrice: 22.9,
        isDefault: true,
        nutrition: { calories: 480, protein: 30, carbs: 45, fat: 18, fiber: 6, sodium: 620 },
      },
    ],
  },
  {
    slug: 'wrap-veggie',
    name: 'Wrap veggie',
    category: 'wraps',
    type: 'FIXED',
    description: 'Tortilla integral, hummus, falafel, pepino, tomate y hojas verdes.',
    tags: ['vegetariano', 'vegano'],
    allergens: ['gluten', 'sesamo'],
    variants: [
      {
        name: 'Unico',
        sku: 'WRAP-VEGGIE',
        basePrice: 21.9,
        isDefault: true,
        nutrition: { calories: 430, protein: 15, carbs: 56, fat: 14, fiber: 10, sodium: 540 },
      },
    ],
  },
  {
    slug: 'edamame-al-vapor',
    name: 'Edamame al vapor',
    category: 'entrantes',
    type: 'FIXED',
    description: 'Vainas de soya al vapor con sal marina.',
    tags: ['vegano', 'vegetariano', 'bajo-en-calorias', 'sin-gluten'],
    allergens: ['soya'],
    variants: [
      {
        name: 'Porcion',
        sku: 'ENT-EDAMAME',
        basePrice: 12.9,
        isDefault: true,
        nutrition: { calories: 190, protein: 16, carbs: 14, fat: 8, fiber: 8, sodium: 280 },
      },
    ],
  },
  {
    slug: 'chips-de-camote',
    name: 'Chips de camote',
    category: 'entrantes',
    type: 'FIXED',
    description: 'Camote al horno con romero y un toque de sal.',
    tags: ['vegano', 'vegetariano', 'sin-gluten'],
    allergens: [],
    variants: [
      {
        name: 'Porcion',
        sku: 'ENT-CAMOTE',
        basePrice: 9.9,
        isDefault: true,
        nutrition: { calories: 220, protein: 2, carbs: 38, fat: 7, fiber: 5, sodium: 210 },
      },
    ],
  },
  {
    slug: 'mousse-de-maracuya',
    name: 'Mousse de maracuya fit',
    category: 'postres',
    type: 'FIXED',
    description: 'Mousse ligero de maracuya endulzado con panela.',
    tags: ['vegetariano', 'bajo-en-calorias'],
    allergens: ['lacteos', 'huevo'],
    variants: [
      {
        name: 'Unico',
        sku: 'POST-MARACUYA',
        basePrice: 12.9,
        isDefault: true,
        nutrition: { calories: 180, protein: 6, carbs: 24, fat: 6, fiber: 1, sodium: 90 },
      },
    ],
  },
  {
    slug: 'limonada-de-hierbabuena',
    name: 'Limonada de hierbabuena',
    category: 'bebidas',
    type: 'FIXED',
    description: 'Limon fresco, hierbabuena y poca azucar.',
    tags: ['vegano', 'bajo-en-calorias', 'sin-gluten'],
    allergens: [],
    variants: [
      {
        name: '500 ml',
        sku: 'BEB-LIMONADA',
        basePrice: 8.9,
        isDefault: true,
        nutrition: { calories: 90, protein: 0, carbs: 22, fat: 0, fiber: 0, sodium: 15 },
      },
    ],
  },
  {
    slug: 'agua-mineral',
    name: 'Agua mineral',
    category: 'bebidas',
    type: 'FIXED',
    description: 'Agua mineral sin gas, 600 ml.',
    tags: ['vegano', 'bajo-en-calorias', 'sin-gluten'],
    allergens: [],
    variants: [
      {
        name: '600 ml',
        sku: 'BEB-AGUA',
        basePrice: 5,
        isDefault: true,
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 },
      },
    ],
  },
];

/** Pasos del constructor. free = unidades incluidas sin costo. */
interface SeedGroup {
  code: string;
  name: string;
  description: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  min: number;
  max: number;
  free: number;
  sortOrder: number;
  options: Array<{
    name: string;
    priceDelta: number;
    /** true = suplemento: se cobra siempre, aunque el grupo incluya unidades gratis. */
    chargeAlways?: boolean;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    maxPerItem?: number;
    description?: string;
    dietaryTags?: string[];
    allergens?: string[];
    spiceLevel?: number;
  }>;
}

const GROUPS: SeedGroup[] = [
  {
    code: 'base',
    name: 'Base',
    description: 'Elige el cereal o las hojas que van al fondo del bowl.',
    selectionType: 'SINGLE',
    min: 1,
    max: 1,
    free: 1,
    sortOrder: 1,
    options: [
      { name: 'Arroz blanco', priceDelta: 0, calories: 200, protein: 4, carbs: 44, fat: 0 },
      { name: 'Arroz integral', priceDelta: 0, calories: 190, protein: 5, carbs: 40, fat: 2 },
      { name: 'Quinoa', priceDelta: 2.5, calories: 180, protein: 8, carbs: 32, fat: 3 },
      { name: 'Hojas verdes', priceDelta: 0, calories: 40, protein: 3, carbs: 6, fat: 0 },
      { name: 'Mitad arroz / mitad hojas', priceDelta: 0, calories: 120, protein: 4, carbs: 25, fat: 0 },
    ],
  },
  {
    code: 'proteina',
    name: 'Proteina',
    description:
      'Una proteina incluida. Las premium (pescado y langostinos) pagan suplemento; la segunda proteina siempre se cobra.',
    selectionType: 'MULTIPLE',
    min: 1,
    max: 2,
    free: 1,
    sortOrder: 2,
    options: [
      // Incluidas: entran en la unidad gratis del grupo.
      { name: 'Pollo grillado', priceDelta: 6.0, calories: 165, protein: 31, carbs: 0, fat: 4 },
      { name: 'Tofu marinado', priceDelta: 5.0, calories: 145, protein: 16, carbs: 4, fat: 8 },
      { name: 'Garbanzos especiados', priceDelta: 4.5, calories: 164, protein: 9, carbs: 27, fat: 3 },
      // Premium: suplemento que se cobra siempre (no consume la unidad incluida).
      {
        name: 'Salmon fresco',
        priceDelta: 8.0,
        chargeAlways: true,
        calories: 208,
        protein: 22,
        carbs: 0,
        fat: 13,
      },
      {
        name: 'Atun fresco',
        priceDelta: 7.5,
        chargeAlways: true,
        calories: 150,
        protein: 30,
        carbs: 0,
        fat: 3,
      },
      {
        name: 'Langostinos',
        priceDelta: 8.5,
        chargeAlways: true,
        calories: 120,
        protein: 24,
        carbs: 1,
        fat: 2,
      },
    ],
  },
  {
    code: 'salsa',
    name: 'Salsa',
    description: 'La primera va incluida; la segunda tiene costo.',
    selectionType: 'MULTIPLE',
    min: 1,
    max: 2,
    free: 1,
    sortOrder: 3,
    options: [
      { name: 'Ponzu', priceDelta: 2.0, calories: 30, protein: 1, carbs: 5, fat: 0 },
      { name: 'Sriracha mayo', priceDelta: 2.5, calories: 90, protein: 0, carbs: 2, fat: 9 },
      { name: 'Teriyaki', priceDelta: 2.0, calories: 60, protein: 1, carbs: 13, fat: 0 },
      { name: 'Hummus', priceDelta: 3.0, calories: 80, protein: 3, carbs: 7, fat: 5 },
      { name: 'Yogurt y limon', priceDelta: 2.0, calories: 45, protein: 3, carbs: 4, fat: 2 },
      { name: 'Aceite de oliva y limon', priceDelta: 0, calories: 60, protein: 0, carbs: 0, fat: 7 },
    ],
  },
  {
    code: 'toppings',
    name: 'Toppings',
    description: 'Cuatro incluidos. Desde el quinto se cobra cada uno.',
    selectionType: 'MULTIPLE',
    min: 2,
    max: 8,
    free: 4,
    sortOrder: 4,
    options: [
      { name: 'Palta', priceDelta: 4.0, calories: 120, protein: 1, carbs: 6, fat: 11 },
      { name: 'Edamame', priceDelta: 3.0, calories: 60, protein: 6, carbs: 5, fat: 2 },
      { name: 'Mango', priceDelta: 3.0, calories: 50, protein: 0, carbs: 13, fat: 0 },
      { name: 'Pepino', priceDelta: 2.0, calories: 12, protein: 1, carbs: 2, fat: 0 },
      { name: 'Zanahoria rallada', priceDelta: 2.0, calories: 20, protein: 0, carbs: 5, fat: 0 },
      { name: 'Tomate cherry', priceDelta: 2.5, calories: 18, protein: 1, carbs: 4, fat: 0 },
      { name: 'Choclo', priceDelta: 2.5, calories: 60, protein: 2, carbs: 13, fat: 1 },
      { name: 'Algas wakame', priceDelta: 3.5, calories: 25, protein: 1, carbs: 4, fat: 0 },
      { name: 'Kale', priceDelta: 2.5, calories: 25, protein: 2, carbs: 4, fat: 0 },
      { name: 'Camote al horno', priceDelta: 3.0, calories: 90, protein: 1, carbs: 21, fat: 0 },
    ],
  },
  {
    code: 'crunch',
    name: 'Crunch y extras',
    description: 'El toque final. Todos tienen costo.',
    selectionType: 'MULTIPLE',
    min: 0,
    max: 3,
    free: 0,
    sortOrder: 5,
    options: [
      { name: 'Ajonjoli tostado', priceDelta: 1.5, calories: 50, protein: 2, carbs: 2, fat: 4 },
      { name: 'Mani crocante', priceDelta: 2.5, calories: 95, protein: 4, carbs: 3, fat: 8 },
      { name: 'Cebolla crispy', priceDelta: 2.5, calories: 80, protein: 1, carbs: 8, fat: 5 },
      { name: 'Chips de wonton', priceDelta: 2.5, calories: 110, protein: 2, carbs: 14, fat: 5 },
      { name: 'Furikake', priceDelta: 2.0, calories: 30, protein: 1, carbs: 2, fat: 2 },
    ],
  },
];

/** Combinaciones que no se permiten (RN-006). */
const INCOMPATIBILITIES: Array<[string, string, string]> = [
  ['Salmon fresco', 'Atun fresco', 'No combinamos dos pescados crudos en el mismo bowl'],
  ['Sriracha mayo', 'Hummus', 'Las dos salsas cremosas juntas desbalancean el bowl'],
];

/** Recursos locales generados para la experiencia visual del constructor. */
const BUILDER_IMAGE = '/images/builder/bowl-signature.jpg';
const GROUP_IMAGES: Record<string, string> = {
  base: '/images/builder/bases.jpg',
  proteina: '/images/builder/proteins.jpg',
  salsa: '/images/builder/sauces.jpg',
  toppings: '/images/builder/toppings.jpg',
  crunch: '/images/builder/crunch.jpg',
};

const INGREDIENT_SLUGS: Record<string, string> = {
  'Arroz blanco': 'arroz-blanco', 'Arroz integral': 'arroz-integral', Quinoa: 'quinoa',
  'Hojas verdes': 'hojas-verdes', 'Mitad arroz / mitad hojas': 'mitad-arroz-hojas',
  'Pollo grillado': 'pollo-grillado', 'Tofu marinado': 'tofu-marinado',
  'Garbanzos especiados': 'garbanzos-especiados', 'Salmon fresco': 'salmon-fresco',
  'Atun fresco': 'atun-fresco', Langostinos: 'langostinos', Ponzu: 'ponzu',
  'Sriracha mayo': 'sriracha-mayo', Teriyaki: 'teriyaki', Hummus: 'hummus',
  'Yogurt y limon': 'yogurt-limon', 'Aceite de oliva y limon': 'aceite-oliva-limon',
  Palta: 'palta', Edamame: 'edamame', Mango: 'mango', Pepino: 'pepino',
  'Zanahoria rallada': 'zanahoria-rallada', 'Tomate cherry': 'tomate-cherry', Choclo: 'choclo',
  'Algas wakame': 'algas-wakame', Kale: 'kale', 'Camote al horno': 'camote-horno',
  'Ajonjoli tostado': 'ajonjoli-tostado', 'Mani crocante': 'mani-crocante',
  'Cebolla crispy': 'cebolla-crispy', 'Chips de wonton': 'chips-wonton', Furikake: 'furikake',
};

const INGREDIENT_META: Record<string, { description: string; tags?: string[]; allergens?: string[]; spice?: number }> = {
  'Arroz blanco': { description: 'Suave, esponjoso y de sabor neutro.', tags: ['vegano', 'sin gluten'] },
  'Arroz integral': { description: 'Grano entero, textura firme y más fibra.', tags: ['vegano', 'sin gluten'] },
  Quinoa: { description: 'Ligera, nutritiva y con un delicado sabor a nuez.', tags: ['vegano', 'sin gluten', 'alto en proteina'] },
  'Hojas verdes': { description: 'Mezcla fresca y crujiente de hojas de temporada.', tags: ['vegano', 'sin gluten', 'ligero'] },
  'Mitad arroz / mitad hojas': { description: 'Equilibrio entre saciedad y frescura.', tags: ['vegano', 'sin gluten'] },
  'Pollo grillado': { description: 'Pechuga marinada y dorada a la plancha.', tags: ['sin gluten', 'alto en proteina'] },
  'Tofu marinado': { description: 'Tofu dorado con marinada de soya y cítricos.', tags: ['vegano', 'alto en proteina'], allergens: ['soya'] },
  'Garbanzos especiados': { description: 'Garbanzos tiernos con especias cálidas.', tags: ['vegano', 'sin gluten'], spice: 1 },
  'Salmon fresco': { description: 'Salmón fresco, corte suave y sabor delicado.', tags: ['sin gluten', 'alto en proteina'], allergens: ['pescado'] },
  'Atun fresco': { description: 'Atún fresco magro, de textura firme.', tags: ['sin gluten', 'alto en proteina'], allergens: ['pescado'] },
  Langostinos: { description: 'Langostinos jugosos, salteados al momento.', tags: ['sin gluten', 'alto en proteina'], allergens: ['mariscos'] },
  Ponzu: { description: 'Salsa cítrica japonesa, ligera y umami.', tags: ['vegano'], allergens: ['soya'] },
  'Sriracha mayo': { description: 'Cremosa, ligeramente dulce y picante.', allergens: ['huevo'], spice: 2 },
  Teriyaki: { description: 'Salsa dulce y umami con notas de jengibre.', tags: ['vegano'], allergens: ['soya'] },
  Hummus: { description: 'Crema de garbanzos y tahini, suave y sabrosa.', tags: ['vegano', 'sin gluten'], allergens: ['sesamo'] },
  'Yogurt y limon': { description: 'Cremosa, fresca y de acidez delicada.', tags: ['vegetariano'], allergens: ['lacteos'] },
  'Aceite de oliva y limon': { description: 'Aliño limpio, cítrico y muy ligero.', tags: ['vegano', 'sin gluten'] },
  Palta: { description: 'Palta madura y cremosa, cortada al momento.', tags: ['vegano', 'sin gluten'] },
  Edamame: { description: 'Edamame tierno con un toque de sal.', tags: ['vegano', 'alto en proteina'], allergens: ['soya'] },
  Mango: { description: 'Mango fresco, dulce y jugoso.', tags: ['vegano', 'sin gluten'] },
  Pepino: { description: 'Pepino fresco de textura crujiente.', tags: ['vegano', 'sin gluten', 'ligero'] },
  'Zanahoria rallada': { description: 'Zanahoria fresca, dulce y crocante.', tags: ['vegano', 'sin gluten'] },
  'Tomate cherry': { description: 'Tomates dulces y jugosos, partidos a la mitad.', tags: ['vegano', 'sin gluten'] },
  Choclo: { description: 'Granos de choclo dulce y tierno.', tags: ['vegano', 'sin gluten'] },
  'Algas wakame': { description: 'Algas suaves con sabor marino y umami.', tags: ['vegano', 'ligero'], allergens: ['sesamo'] },
  Kale: { description: 'Kale fresco, masajeado para una textura suave.', tags: ['vegano', 'sin gluten', 'ligero'] },
  'Camote al horno': { description: 'Camote asado, caramelizado y reconfortante.', tags: ['vegano', 'sin gluten'] },
  'Ajonjoli tostado': { description: 'Semillas tostadas con aroma a nuez.', tags: ['vegano', 'sin gluten'], allergens: ['sesamo'] },
  'Mani crocante': { description: 'Maní tostado para un final extra crujiente.', tags: ['vegano', 'sin gluten'], allergens: ['frutos-secos'] },
  'Cebolla crispy': { description: 'Cebolla dorada, fina y crujiente.', tags: ['vegano'], allergens: ['gluten'] },
  'Chips de wonton': { description: 'Láminas de wonton doradas y crocantes.', tags: ['vegano'], allergens: ['gluten'] },
  Furikake: { description: 'Condimento japonés de sésamo y algas.', allergens: ['sesamo', 'pescado'] },
};

const BUILDER_PRESETS = [
  {
    code: 'favorito_casa', name: 'Favorito de la casa', badge: 'Más pedido',
    description: 'Pollo grillado, ponzu y toppings frescos en una combinación equilibrada.',
    imageUrl: BUILDER_IMAGE, featured: true,
    options: ['Arroz blanco', 'Pollo grillado', 'Ponzu', 'Palta', 'Edamame', 'Mango', 'Pepino', 'Ajonjoli tostado'],
  },
  {
    code: 'alto_proteina', name: 'Power protein', badge: 'Alto en proteína',
    description: 'Quinoa, pollo y salmón con vegetales frescos para recargar energía.',
    imageUrl: '/images/builder/proteins.jpg', featured: true,
    options: ['Quinoa', 'Pollo grillado', 'Salmon fresco', 'Teriyaki', 'Edamame', 'Pepino', 'Tomate cherry', 'Kale', 'Furikake'],
  },
  {
    code: 'vegano_colorido', name: 'Vegano colorido', badge: '100% vegetal',
    description: 'Tofu, hummus y una mezcla colorida de vegetales y frutas.',
    imageUrl: '/images/builder/toppings.jpg', featured: false,
    options: ['Hojas verdes', 'Tofu marinado', 'Hummus', 'Palta', 'Mango', 'Pepino', 'Zanahoria rallada', 'Mani crocante'],
  },
  {
    code: 'ligero_fresco', name: 'Ligero y fresco', badge: 'Menos de 500 kcal',
    description: 'Hojas verdes, atún y aliño cítrico con toppings livianos.',
    imageUrl: '/images/builder/bases.jpg', featured: false,
    options: ['Hojas verdes', 'Atun fresco', 'Aceite de oliva y limon', 'Pepino', 'Tomate cherry', 'Kale', 'Algas wakame'],
  },
];

export const seedCatalog = async (): Promise<void> => {
  // 1) Categorias, alergenos y etiquetas
  const categoryByslug = new Map<string, number>();
  for (const category of CATEGORIES) {
    const [row] = await Category.findOrCreate({
      where: { slug: category.slug },
      defaults: { ...category, isActive: true },
    });
    categoryByslug.set(category.slug, row.id);
  }

  const allergenByCode = new Map<string, number>();
  for (const allergen of ALLERGENS) {
    const [row] = await Allergen.findOrCreate({
      where: { code: allergen.code },
      defaults: {
        ...allergen,
        warning: 'Elaborado en una cocina donde se manipulan otros alergenos.',
      },
    });
    allergenByCode.set(allergen.code, row.id);
  }

  const tagByCode = new Map<string, number>();
  for (const tag of DIETARY_TAGS) {
    const [row] = await DietaryTag.findOrCreate({ where: { code: tag.code }, defaults: tag });
    tagByCode.set(tag.code, row.id);
  }

  // 2) Productos, variantes y nutricion
  let customizableProductId: number | null = null;

  for (const seed of PRODUCTS) {
    const categoryId = categoryByslug.get(seed.category);
    if (!categoryId) continue;

    const [product] = await Product.findOrCreate({
      where: { slug: seed.slug },
      defaults: {
        categoryId,
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        type: seed.type === 'CUSTOMIZABLE' ? PRODUCT_TYPE.CUSTOMIZABLE : PRODUCT_TYPE.FIXED,
        isFeatured: seed.isFeatured ?? false,
        imageUrl: seed.type === 'CUSTOMIZABLE' ? BUILDER_IMAGE : null,
        sortOrder: 0,
      },
    });

    // Completa recursos visuales faltantes sin reemplazar una imagen gestionada en el panel.
    if (
      seed.type === 'CUSTOMIZABLE' &&
      (!product.imageUrl || product.imageUrl === '/images/builder/bowl-signature.png')
    ) {
      await product.update({ imageUrl: BUILDER_IMAGE });
    }

    if (seed.type === 'CUSTOMIZABLE') customizableProductId = product.id;

    for (const variant of seed.variants) {
      const [row] = await ProductVariant.findOrCreate({
        where: { sku: variant.sku },
        defaults: {
          productId: product.id,
          name: variant.name,
          sku: variant.sku,
          basePrice: variant.basePrice,
          isDefault: variant.isDefault ?? false,
          servingSize: null,
          servingUnit: 'g',
        },
      });

      await ProductNutrition.findOrCreate({
        where: { variantId: row.id },
        defaults: {
          productId: product.id,
          variantId: row.id,
          calories: variant.nutrition.calories,
          protein: variant.nutrition.protein,
          carbs: variant.nutrition.carbs,
          fat: variant.nutrition.fat,
          fiber: variant.nutrition.fiber ?? 0,
          sodium: variant.nutrition.sodium ?? 0,
        },
      });
    }

    for (const code of seed.tags) {
      const dietaryTagId = tagByCode.get(code);
      if (!dietaryTagId) continue;
      await ProductDietaryTag.findOrCreate({
        where: { productId: product.id, dietaryTagId },
        defaults: { productId: product.id, dietaryTagId },
      });
    }

    for (const code of seed.allergens) {
      const allergenId = allergenByCode.get(code);
      if (!allergenId) continue;
      await ProductAllergen.findOrCreate({
        where: { productId: product.id, allergenId },
        defaults: { productId: product.id, allergenId, level: 'CONTAINS' },
      });
    }
  }

  // 3) Grupos y opciones del constructor
  const optionByName = new Map<string, number>();

  for (const group of GROUPS) {
    const [groupRow] = await CustomizationGroup.findOrCreate({
      where: { code: group.code },
      defaults: {
        code: group.code,
        name: group.name,
        description: group.description,
        selectionType:
          group.selectionType === 'SINGLE' ? SELECTION_TYPE.SINGLE : SELECTION_TYPE.MULTIPLE,
        minSelection: group.min,
        maxSelection: group.max,
        freeQuantity: group.free,
        sortOrder: group.sortOrder,
        isActive: true,
      },
    });

    const currentOptions = await CustomizationOption.findAll({ where: { groupId: groupRow.id } });
    const shouldSeedOptionOrder =
      currentOptions.length > 1 && currentOptions.every((entry) => entry.sortOrder === 0);

    for (const [optionIndex, option] of group.options.entries()) {
      const meta = INGREDIENT_META[option.name];
      const ingredientImage = `/images/builder/ingredients/${INGREDIENT_SLUGS[option.name]}.jpg`;
      const [optionRow, created] = await CustomizationOption.findOrCreate({
        where: { groupId: groupRow.id, name: option.name },
        defaults: {
          groupId: groupRow.id,
          name: option.name,
          priceDelta: option.priceDelta,
          chargeAlways: option.chargeAlways ?? false,
          calories: option.calories,
          protein: option.protein,
          carbs: option.carbs,
          fat: option.fat,
          maxPerItem: option.maxPerItem ?? 1,
          description: option.description ?? meta?.description ?? null,
          imageUrl: ingredientImage,
          imageAlt: `${option.name} servido como ingrediente para bowl`,
          imagePosition: '50% 50%',
          dietaryTags: option.dietaryTags ?? meta?.tags ?? [],
          allergens: option.allergens ?? meta?.allergens ?? [],
          spiceLevel: option.spiceLevel ?? meta?.spice ?? 0,
          sortOrder: optionIndex,
          ingredientId: null,
        },
      });

      // El seeder NO pisa lo que ya existe.
      //
      // Antes si lo hacia (para poder ajustar el catalogo de ejemplo editando este
      // archivo), pero ahora el catalogo se administra desde el panel: si el seeder
      // reescribiera los precios en cada reinicio, borraria el trabajo del gestor
      // de catalogo. Sembrar es "crear si no existe", nunca "sobrescribir".
      const groupImage = GROUP_IMAGES[group.code];
      const legacyImage = groupImage?.replace(/\.jpg$/, '.png');
      const isLegacyImage =
        !optionRow.imageUrl ||
        optionRow.imageUrl === legacyImage ||
        Object.values(GROUP_IMAGES).includes(optionRow.imageUrl);
      const missingMeta = !optionRow.description && meta;
      if (!created && (isLegacyImage || missingMeta || shouldSeedOptionOrder)) {
        await optionRow.update({
          ...(isLegacyImage ? { imageUrl: ingredientImage, imageAlt: `${option.name} servido como ingrediente para bowl` } : {}),
          ...(missingMeta ? {
            description: meta.description,
            dietaryTags: meta.tags ?? [],
            allergens: meta.allergens ?? [],
            spiceLevel: meta.spice ?? 0,
          } : {}),
          ...(shouldSeedOptionOrder ? { sortOrder: optionIndex } : {}),
        });
      }

      optionByName.set(option.name, optionRow.id);
    }

    // 4) Los grupos se enlazan al producto personalizable
    if (customizableProductId) {
      await ProductCustomizationGroup.findOrCreate({
        where: { productId: customizableProductId, groupId: groupRow.id, variantId: null },
        defaults: {
          productId: customizableProductId,
          groupId: groupRow.id,
          variantId: null,
          sortOrder: group.sortOrder,
          minSelectionOverride: null,
          maxSelectionOverride: null,
          freeQuantityOverride: null,
          isActive: true,
        },
      });
    }
  }

  // 5) Incompatibilidades
  for (const [a, b, reason] of INCOMPATIBILITIES) {
    const optionId = optionByName.get(a);
    const incompatibleOptionId = optionByName.get(b);
    if (!optionId || !incompatibleOptionId) continue;

    await OptionIncompatibility.findOrCreate({
      where: { optionId, incompatibleOptionId },
      defaults: { optionId, incompatibleOptionId, reason },
    });
  }

  // 6) Combinaciones recomendadas. Se crean una vez y luego se administran desde el panel.
  if (customizableProductId) {
    for (const [presetIndex, seed] of BUILDER_PRESETS.entries()) {
      const [preset, presetCreated] = await BuilderPreset.findOrCreate({
        where: { productId: customizableProductId, code: seed.code },
        defaults: {
          productId: customizableProductId,
          code: seed.code,
          name: seed.name,
          description: seed.description,
          imageUrl: seed.imageUrl,
          badge: seed.badge,
          isFeatured: seed.featured,
          isActive: true,
          sortOrder: presetIndex,
        },
      });

      if (presetCreated || (await BuilderPresetItem.count({ where: { presetId: preset.id } })) === 0) {
        const items = seed.options.flatMap((name, index) => {
          const optionId = optionByName.get(name);
          return optionId ? [{ presetId: preset.id, optionId, quantity: 1, sortOrder: index }] : [];
        });
        if (items.length) await BuilderPresetItem.bulkCreate(items, { ignoreDuplicates: true });
      }
    }
  }

  logger.success(
    `Catalogo listo: ${PRODUCTS.length} productos, ${GROUPS.length} pasos del constructor`,
  );
};
