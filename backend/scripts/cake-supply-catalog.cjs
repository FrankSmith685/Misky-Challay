/** Insumos base para el catalogo de tortas Misky Challay. */
const supplies = [
  // Masas y sabores base.
  { code: 'MC-HARINA-TRIGO', name: 'Harina de trigo para repostería', unit: 'g', unitCost: 0.006, minLevel: 5000, initialStock: 15000, image: 'harina-trigo.png', alt: 'Harina de trigo para repostería' },
  { code: 'MC-AZUCAR', name: 'Azúcar blanca', unit: 'g', unitCost: 0.004, minLevel: 1000, initialStock: 10000, image: 'azucar.png', alt: 'Azúcar blanca granulada' },
  { code: 'MC-HUEVO', name: 'Huevos frescos', unit: 'und', unitCost: 0.5, minLevel: 24, initialStock: 120, image: 'huevo.png', alt: 'Huevos frescos' },
  { code: 'MC-MANTEQUILLA', name: 'Mantequilla sin sal', unit: 'g', unitCost: 0.018, minLevel: 500, initialStock: 5000, image: 'mantequilla.png', alt: 'Mantequilla sin sal' },
  { code: 'MC-LECHE', name: 'Leche entera', unit: 'ml', unitCost: 0.005, minLevel: 1000, initialStock: 10000, image: 'leche.png', alt: 'Leche entera' },
  { code: 'MC-POLVO-HORNEAR', name: 'Polvo para hornear', unit: 'g', unitCost: 0.025, minLevel: 100, initialStock: 1000, image: 'polvo-hornear.png', alt: 'Polvo para hornear' },
  { code: 'MC-VAINILLA', name: 'Extracto de vainilla', unit: 'ml', unitCost: 0.06, minLevel: 100, initialStock: 1000, image: 'vainilla.png', alt: 'Extracto de vainilla' },
  { code: 'MC-SAL', name: 'Sal fina', unit: 'g', unitCost: 0.003, minLevel: 100, initialStock: 1000, image: 'sal.png', alt: 'Sal fina' },
  { code: 'MC-CACAO', name: 'Cacao puro en polvo', unit: 'g', unitCost: 0.035, minLevel: 250, initialStock: 2500, image: 'cacao.png', alt: 'Cacao puro en polvo' },
  { code: 'MC-CHOCOLATE-COBERTURA', name: 'Chocolate para cobertura', unit: 'g', unitCost: 0.03, minLevel: 500, initialStock: 5000, image: 'chocolate-cobertura.png', alt: 'Chocolate para cobertura' },
  { code: 'MC-ZANAHORIA', name: 'Zanahoria fresca', unit: 'g', unitCost: 0.004, minLevel: 500, initialStock: 5000, image: 'zanahoria.png', alt: 'Zanahoria fresca' },
  { code: 'MC-CANELA', name: 'Canela en polvo', unit: 'g', unitCost: 0.04, minLevel: 50, initialStock: 500, image: 'canela.png', alt: 'Canela en polvo' },
  { code: 'MC-COLORANTE-ROJO', name: 'Colorante rojo', unit: 'ml', unitCost: 0.12, minLevel: 30, initialStock: 250, image: 'colorante-rojo.png', alt: 'Colorante rojo' },
  { code: 'MC-VINAGRE', name: 'Vinagre blanco', unit: 'ml', unitCost: 0.004, minLevel: 100, initialStock: 1000, image: 'vinagre.png', alt: 'Vinagre blanco' },
  { code: 'MC-PLATANO', name: 'Plátano maduro', unit: 'g', unitCost: 0.006, minLevel: 1000, initialStock: 10000, image: 'platano.png', alt: 'Plátano maduro' },
  { code: 'MC-CHOCOLATE-CHIPS', name: 'Chispas de chocolate', unit: 'g', unitCost: 0.03, minLevel: 250, initialStock: 2500, image: 'chocochips.png', alt: 'Chispas de chocolate' },
  { code: 'MC-ARANDANOS', name: 'Arándanos', unit: 'g', unitCost: 0.04, minLevel: 250, initialStock: 2500, image: 'arandanos.png', alt: 'Arándanos' },
  { code: 'MC-GRAGEAS', name: 'Grageas de colores', unit: 'g', unitCost: 0.025, minLevel: 100, initialStock: 1000, image: 'grageas.png', alt: 'Grageas de colores' },
  { code: 'MC-NARANJA', name: 'Naranja para jugo y ralladura', unit: 'g', unitCost: 0.005, minLevel: 1000, initialStock: 5000, image: 'naranja.png', alt: 'Naranja para jugo y ralladura' },
  { code: 'MC-FRUTAS-CONFITADAS', name: 'Frutas confitadas', unit: 'g', unitCost: 0.03, minLevel: 250, initialStock: 2500, image: 'frutas-confitadas.png', alt: 'Frutas confitadas' },
  { code: 'MC-FRUTOS-SECOS', name: 'Frutos secos', unit: 'g', unitCost: 0.05, minLevel: 250, initialStock: 2500, image: 'frutos-secos.png', alt: 'Frutos secos' },

  // Rellenos mostrados en las referencias.
  { code: 'MC-MANJAR', name: 'Manjar de olla', unit: 'g', unitCost: 0.018, minLevel: 500, initialStock: 5000, image: 'manjar.png', alt: 'Manjar de olla' },
  { code: 'MC-FUDGE', name: 'Fudge casero', unit: 'g', unitCost: 0.025, minLevel: 500, initialStock: 4000, image: 'fudge.png', alt: 'Fudge casero' },
  { code: 'MC-FROSTING-ESPECIAL', name: 'Frosting especial', unit: 'g', unitCost: 0.02, minLevel: 500, initialStock: 4000, image: 'frosting-especial.png', alt: 'Frosting especial' },
  { code: 'MC-GANACHE-CAFE', name: 'Ganache de café', unit: 'g', unitCost: 0.03, minLevel: 500, initialStock: 3000, image: 'ganache-cafe.png', alt: 'Ganache de café' },
  { code: 'MC-FROSTING-OREO', name: 'Frosting de Oreo', unit: 'g', unitCost: 0.025, minLevel: 500, initialStock: 3000, image: 'frosting-oreo.png', alt: 'Frosting de Oreo' },
  { code: 'MC-MERMELADA-FRESA', name: 'Mermelada de fresa', unit: 'g', unitCost: 0.012, minLevel: 500, initialStock: 3000, image: 'mermelada-fresa.png', alt: 'Mermelada de fresa' },
  { code: 'MC-GANACHE-MARACUYA', name: 'Ganache de maracuyá', unit: 'g', unitCost: 0.03, minLevel: 500, initialStock: 3000, image: 'ganache-maracuya.png', alt: 'Ganache de maracuyá' },
  { code: 'MC-FROSTING-CHOCOLATE', name: 'Frosting de chocolate', unit: 'g', unitCost: 0.025, minLevel: 500, initialStock: 3000, image: 'frosting-chocolate.png', alt: 'Frosting de chocolate' },
  { code: 'MC-MERMELADA-ARANDANOS', name: 'Mermelada de arándanos', unit: 'g', unitCost: 0.018, minLevel: 500, initialStock: 2000, image: 'mermelada-arandanos.png', alt: 'Mermelada de arándanos' },
  { code: 'MC-GANACHE-PISTACHO', name: 'Ganache de pistacho', unit: 'g', unitCost: 0.05, minLevel: 250, initialStock: 1500, image: 'ganache-pistacho.png', alt: 'Ganache de pistacho' },
  { code: 'MC-MANJAR-PISTACHO', name: 'Manjar de pistacho', unit: 'g', unitCost: 0.05, minLevel: 250, initialStock: 1500, image: 'manjar-pistacho.png', alt: 'Manjar de pistacho' },
  { code: 'MC-NUTELLA', name: 'Nutella', unit: 'g', unitCost: 0.04, minLevel: 500, initialStock: 2500, image: 'nutella.png', alt: 'Nutella' },

  // Coberturas, decoracion y empaque.
  { code: 'MC-BUTTERCREAM', name: 'Crema de mantequilla', unit: 'g', unitCost: 0.02, minLevel: 500, initialStock: 5000, image: 'buttercream.png', alt: 'Crema de mantequilla' },
  { code: 'MC-CREMA-LECHE', name: 'Crema de leche', unit: 'ml', unitCost: 0.015, minLevel: 500, initialStock: 5000, image: 'crema-leche.png', alt: 'Crema de leche' },
  { code: 'MC-CAFE', name: 'Café instantáneo', unit: 'g', unitCost: 0.08, minLevel: 50, initialStock: 500, image: 'cafe.png', alt: 'Café instantáneo' },
  { code: 'MC-GALLETAS-OREO', name: 'Galletas Oreo', unit: 'g', unitCost: 0.025, minLevel: 250, initialStock: 2000, image: 'galletas-oreo.png', alt: 'Galletas Oreo' },
  { code: 'MC-MARACUYA', name: 'Pulpa de maracuyá', unit: 'g', unitCost: 0.012, minLevel: 500, initialStock: 3000, image: 'maracuya.png', alt: 'Pulpa de maracuyá' },
  { code: 'MC-PISTACHO', name: 'Pasta de pistacho', unit: 'g', unitCost: 0.08, minLevel: 250, initialStock: 1000, image: 'pistacho.png', alt: 'Pasta de pistacho' },
  { code: 'MC-FONDANT', name: 'Fondant para decoración', unit: 'g', unitCost: 0.035, minLevel: 500, initialStock: 4000, image: 'fondant.png', alt: 'Fondant para decoración' },
  { code: 'MC-COLORANTES', name: 'Colorantes para decoración', unit: 'ml', unitCost: 0.12, minLevel: 30, initialStock: 250, image: 'colorantes.png', alt: 'Colorantes para decoración' },
  { code: 'MC-CAJA-TORTA', name: 'Caja para torta', unit: 'und', unitCost: 4, minLevel: 10, initialStock: 50, image: 'caja-torta.png', alt: 'Caja para torta' },
  { code: 'MC-BASE-TORTA', name: 'Base rígida para torta', unit: 'und', unitCost: 2.5, minLevel: 10, initialStock: 50, image: 'base-torta.png', alt: 'Base rígida para torta' },
];

module.exports = { supplies };
