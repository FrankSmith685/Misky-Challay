const labels: Record<string, string> = { gluten: 'Gluten', lacteos: 'Lácteos', huevo: 'Huevo', 'frutos-secos': 'Frutos secos', mani: 'Maní', mariscos: 'Mariscos', pescado: 'Pescado', sesamo: 'Sésamo', soya: 'Soya', sulfitos: 'Sulfitos' };
export const allergenLabel = (code: string) => labels[code] ?? code;
