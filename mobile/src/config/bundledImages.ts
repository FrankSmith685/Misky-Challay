/**
 * Imágenes del catálogo inicial empacadas dentro del APK/AAB.
 *
 * El backend guarda rutas públicas para que web y app compartan el catálogo,
 * pero una app instalada no puede depender de que Vite (:5173) esté levantado.
 * Las rutas administradas/subidas posteriormente siguen cargándose por HTTP;
 * solo estas rutas conocidas tienen respaldo local y funcionan sin conexión.
 */
const IMAGES: Record<string, number> = {
  '/images/menu/agua-mineral.jpg': require('../../assets/catalog/menu/agua-mineral.jpg'),
  '/images/menu/bowl-mediterraneo.jpg': require('../../assets/catalog/menu/bowl-mediterraneo.jpg'),
  '/images/menu/bowl-pollo-teriyaki.jpg': require('../../assets/catalog/menu/bowl-pollo-teriyaki.jpg'),
  '/images/menu/bowl-vegano-quinoa.jpg': require('../../assets/catalog/menu/bowl-vegano-quinoa.jpg'),
  '/images/menu/chips-de-camote.jpg': require('../../assets/catalog/menu/chips-de-camote.jpg'),
  '/images/menu/edamame-al-vapor.jpg': require('../../assets/catalog/menu/edamame-al-vapor.jpg'),
  '/images/menu/limonada-de-hierbabuena.jpg': require('../../assets/catalog/menu/limonada-de-hierbabuena.jpg'),
  '/images/menu/mousse-de-maracuya.jpg': require('../../assets/catalog/menu/mousse-de-maracuya.jpg'),
  '/images/menu/poke-clasico-salmon.jpg': require('../../assets/catalog/menu/poke-clasico-salmon.jpg'),
  '/images/menu/wrap-de-pollo.jpg': require('../../assets/catalog/menu/wrap-de-pollo.jpg'),
  '/images/menu/wrap-veggie.jpg': require('../../assets/catalog/menu/wrap-veggie.jpg'),
  '/images/builder/bases.jpg': require('../../assets/catalog/builder/bases.jpg'),
  '/images/builder/bowl-signature.jpg': require('../../assets/catalog/builder/bowl-signature.jpg'),
  '/images/builder/crunch.jpg': require('../../assets/catalog/builder/crunch.jpg'),
  '/images/builder/proteins.jpg': require('../../assets/catalog/builder/proteins.jpg'),
  '/images/builder/sauces.jpg': require('../../assets/catalog/builder/sauces.jpg'),
  '/images/builder/toppings.jpg': require('../../assets/catalog/builder/toppings.jpg'),
  '/images/builder/ingredients/aceite-oliva-limon.jpg': require('../../assets/catalog/builder/ingredients/aceite-oliva-limon.jpg'),
  '/images/builder/ingredients/ajonjoli-tostado.jpg': require('../../assets/catalog/builder/ingredients/ajonjoli-tostado.jpg'),
  '/images/builder/ingredients/algas-wakame.jpg': require('../../assets/catalog/builder/ingredients/algas-wakame.jpg'),
  '/images/builder/ingredients/arroz-blanco.jpg': require('../../assets/catalog/builder/ingredients/arroz-blanco.jpg'),
  '/images/builder/ingredients/arroz-integral.jpg': require('../../assets/catalog/builder/ingredients/arroz-integral.jpg'),
  '/images/builder/ingredients/atun-fresco.jpg': require('../../assets/catalog/builder/ingredients/atun-fresco.jpg'),
  '/images/builder/ingredients/camote-horno.jpg': require('../../assets/catalog/builder/ingredients/camote-horno.jpg'),
  '/images/builder/ingredients/cebolla-crispy.jpg': require('../../assets/catalog/builder/ingredients/cebolla-crispy.jpg'),
  '/images/builder/ingredients/chips-wonton.jpg': require('../../assets/catalog/builder/ingredients/chips-wonton.jpg'),
  '/images/builder/ingredients/choclo.jpg': require('../../assets/catalog/builder/ingredients/choclo.jpg'),
  '/images/builder/ingredients/edamame.jpg': require('../../assets/catalog/builder/ingredients/edamame.jpg'),
  '/images/builder/ingredients/furikake.jpg': require('../../assets/catalog/builder/ingredients/furikake.jpg'),
  '/images/builder/ingredients/garbanzos-especiados.jpg': require('../../assets/catalog/builder/ingredients/garbanzos-especiados.jpg'),
  '/images/builder/ingredients/hojas-verdes.jpg': require('../../assets/catalog/builder/ingredients/hojas-verdes.jpg'),
  '/images/builder/ingredients/hummus.jpg': require('../../assets/catalog/builder/ingredients/hummus.jpg'),
  '/images/builder/ingredients/kale.jpg': require('../../assets/catalog/builder/ingredients/kale.jpg'),
  '/images/builder/ingredients/langostinos.jpg': require('../../assets/catalog/builder/ingredients/langostinos.jpg'),
  '/images/builder/ingredients/mango.jpg': require('../../assets/catalog/builder/ingredients/mango.jpg'),
  '/images/builder/ingredients/mani-crocante.jpg': require('../../assets/catalog/builder/ingredients/mani-crocante.jpg'),
  '/images/builder/ingredients/mitad-arroz-hojas.jpg': require('../../assets/catalog/builder/ingredients/mitad-arroz-hojas.jpg'),
  '/images/builder/ingredients/palta.jpg': require('../../assets/catalog/builder/ingredients/palta.jpg'),
  '/images/builder/ingredients/pepino.jpg': require('../../assets/catalog/builder/ingredients/pepino.jpg'),
  '/images/builder/ingredients/pollo-grillado.jpg': require('../../assets/catalog/builder/ingredients/pollo-grillado.jpg'),
  '/images/builder/ingredients/ponzu.jpg': require('../../assets/catalog/builder/ingredients/ponzu.jpg'),
  '/images/builder/ingredients/quinoa.jpg': require('../../assets/catalog/builder/ingredients/quinoa.jpg'),
  '/images/builder/ingredients/salmon-fresco.jpg': require('../../assets/catalog/builder/ingredients/salmon-fresco.jpg'),
  '/images/builder/ingredients/sriracha-mayo.jpg': require('../../assets/catalog/builder/ingredients/sriracha-mayo.jpg'),
  '/images/builder/ingredients/teriyaki.jpg': require('../../assets/catalog/builder/ingredients/teriyaki.jpg'),
  '/images/builder/ingredients/tofu-marinado.jpg': require('../../assets/catalog/builder/ingredients/tofu-marinado.jpg'),
  '/images/builder/ingredients/tomate-cherry.jpg': require('../../assets/catalog/builder/ingredients/tomate-cherry.jpg'),
  '/images/builder/ingredients/yogurt-limon.jpg': require('../../assets/catalog/builder/ingredients/yogurt-limon.jpg'),
  '/images/builder/ingredients/zanahoria-rallada.jpg': require('../../assets/catalog/builder/ingredients/zanahoria-rallada.jpg'),
};

export const bundledImageFor = (uri?: string | null): number | null => {
  if (!uri) return null;
  const path = uri.replace(/^https?:\/\/[^/]+/i, '');
  return IMAGES[path] ?? null;
};
