import { round2 } from './money';

/**
 * IGV
 * ---------------------------------------------------------------------------
 * En Peru el precio al consumidor se muestra SIEMPRE con el IGV incluido: es una
 * obligacion del Codigo de Proteccion y Defensa del Consumidor, no una preferencia.
 * Por eso el impuesto no se suma encima del precio, se EXTRAE de el:
 *
 *   base = bruto / (1 + tasa)
 *   igv  = bruto - base
 *
 * Lo que cambia respecto de antes es solo que el desglose se calcula y se guarda.
 * El cliente sigue pagando exactamente lo mismo.
 */

export interface TaxSplit {
  /** Valor de venta, sin impuesto. */
  base: number;
  /** IGV contenido en el precio. */
  tax: number;
}

export const splitTaxFromGross = (gross: number, rate: number): TaxSplit => {
  if (gross <= 0 || rate <= 0) return { base: round2(Math.max(0, gross)), tax: 0 };

  const base = round2(gross / (1 + rate));
  // El impuesto se saca por diferencia, no con su propia division: asi base + igv
  // siempre reconstruye el bruto exacto y la boleta cuadra al centimo.
  return { base, tax: round2(gross - base) };
};

/**
 * Reparte un importe entre varias lineas de forma proporcional a sus pesos,
 * garantizando que la suma de las partes sea EXACTAMENTE el importe repartido.
 *
 * Es el problema clasico del centimo suelto: repartir S/10 de descuento entre tres
 * lineas iguales da 3,33 + 3,33 + 3,33 = 9,99. Al redondear cada parte por separado
 * el total se descuadra, y una boleta que no cuadra al centimo es una boleta
 * rechazada. Aqui el sobrante se asigna a la linea de mayor peso.
 */
export const allocateProportionally = (amount: number, weights: number[]): number[] => {
  if (weights.length === 0) return [];

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const target = round2(amount);

  if (total <= 0 || target === 0) return weights.map(() => 0);

  const parts = weights.map((weight) => round2((target * weight) / total));
  const assigned = round2(parts.reduce((sum, part) => sum + part, 0));
  const remainder = round2(target - assigned);

  if (remainder !== 0) {
    let heaviest = 0;
    for (let i = 1; i < weights.length; i += 1) {
      if (weights[i] > weights[heaviest]) heaviest = i;
    }
    parts[heaviest] = round2(parts[heaviest] + remainder);
  }

  return parts;
};
