import type { BuilderGroup } from '@features/builder/types';

export interface CakePricePreview {
  basePrice: number;
  optionsTotal: number;
  theme: { name: string; priceDelta: number } | null;
  unitPrice: number;
  lineTotal: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Precio visible mientras se elige. La cotización del servidor valida la compra. */
export function previewCakePrice({
  basePrice,
  groups,
  selections,
  quantity,
  priceScale = 1,
  theme = null,
}: {
  basePrice: number | null;
  groups: BuilderGroup[];
  selections: Array<{ optionId: number; quantity: number }>;
  quantity: number;
  priceScale?: number;
  theme?: CakePricePreview['theme'];
}): CakePricePreview | null {
  if (
    basePrice === null ||
    !Number.isFinite(basePrice) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 20 ||
    !Number.isFinite(priceScale) ||
    priceScale <= 0
  )
    return null;

  let optionsTotal = 0;
  for (const group of groups) {
    const options = new Map(group.options.map((option) => [option.id, option]));
    const chosen = selections.flatMap((selection) => {
      const option = options.get(selection.optionId);
      if (!option?.isAvailable || !Number.isInteger(selection.quantity) || selection.quantity < 1)
        return [];
      return [
        {
          option,
          quantity: selection.quantity,
          price: option.priceDelta * (option.cakeScaleWithServings ? priceScale : 1),
        },
      ];
    });

    // Igual que la cotización: los suplementos no consumen las unidades incluidas;
    // las unidades incluidas se asignan primero a las opciones más caras.
    const charged = new Map<number, number>();
    for (const entry of chosen.filter(({ option }) => option.chargeAlways)) {
      charged.set(entry.option.id, entry.quantity);
    }
    chosen
      .filter(({ option }) => !option.chargeAlways)
      .flatMap((entry) => Array.from({ length: entry.quantity }, () => entry))
      .sort((a, b) => b.price - a.price)
      .forEach((entry, index) => {
        if (index >= group.freeQuantity)
          charged.set(entry.option.id, (charged.get(entry.option.id) ?? 0) + 1);
      });
    for (const entry of chosen) {
      optionsTotal += round2((charged.get(entry.option.id) ?? 0) * round2(entry.price));
    }
  }

  const unitPrice = round2(round2(basePrice) + optionsTotal + (theme?.priceDelta ?? 0));
  return {
    basePrice: round2(basePrice),
    optionsTotal: round2(optionsTotal),
    theme,
    unitPrice,
    lineTotal: round2(unitPrice * quantity),
  };
}
