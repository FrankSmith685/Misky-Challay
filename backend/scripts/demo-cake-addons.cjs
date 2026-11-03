/** Datos de demostración. Confirmar presentaciones y precios antes de vender. */
const cakeAddons = {
  code: 'misky_catalog_complementos',
  name: 'Adicionales',
  description: 'Complementos para acompañar tu torta. Elige las cajas que quieras; estos precios son referenciales.',
  selectionType: 'MULTIPLE',
  minSelection: 0,
  maxSelection: 12,
  freeQuantity: 0,
  sortOrder: 3,
  options: [
    { name: 'Mini alfajores', description: 'Caja de 12 unidades con manjar.', delta: 32, imageUrl: '/images/pastry/mini-alfajores.png', allergens: ['gluten', 'lacteos', 'huevo'] },
    { name: 'Cupcakes', description: 'Caja de 6 unidades para compartir.', delta: 36, imageUrl: '/images/pastry/cupcakes.svg', allergens: ['gluten', 'lacteos', 'huevo'] },
    { name: 'Paletitas de torta', description: 'Caja de 6 cake pops decorados.', delta: 30, imageUrl: '/images/pastry/cake-pops.svg', allergens: ['gluten', 'lacteos', 'huevo'] },
    { name: 'Galletas decoradas', description: 'Caja de 6 unidades.', delta: 30, imageUrl: '/images/pastry/galletas-decoradas.svg', allergens: ['gluten', 'lacteos', 'huevo'] },
    { name: 'Brownies', description: 'Caja de 4 unidades.', delta: 28, imageUrl: '/images/pastry/brownie-almendras.png', allergens: ['gluten', 'lacteos', 'huevo', 'frutos-secos'] },
  ],
};

module.exports = { cakeAddons };
