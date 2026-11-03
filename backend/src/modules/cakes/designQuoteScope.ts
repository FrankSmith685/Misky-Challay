import type { CakeDesignBrief } from '@database/models/cakeProduction.model';
import { describeCakeVisualDesign } from './cakeVisualDesign';

export interface DesignSpecification {
  flavor: string;
  filling: string;
  finish: string;
  inscription: string;
  notes: string;
}

export const buildDesignQuoteScope = (input: {
  modelName?: string | null;
  brief: CakeDesignBrief;
  specification: DesignSpecification;
  conditions: string;
}): string => {
  const { brief, specification, conditions } = input;
  const lines = [
    `MODELO DE REFERENCIA: ${input.modelName || brief.theme || 'Diseño a medida'}`,
    `PORCIONES: ${brief.servings ?? 'según la presentación elegida'}`,
    `SABOR DEL BIZCOCHO: ${specification.flavor.trim()}`,
    `RELLENO: ${specification.filling.trim()}`,
    `DISEÑO Y ACABADO APROBADOS: ${specification.finish.trim()}`,
  ];
  if (specification.inscription.trim()) lines.push(`TEXTO EN LA TORTA: ${specification.inscription.trim()}`);
  if (specification.notes.trim()) lines.push(`DETALLES ACORDADOS: ${specification.notes.trim()}`);
  if (brief.selectedOptions?.length) lines.push(`OPCIONES SOLICITADAS: ${brief.selectedOptions.map((entry) => `${entry.group}: ${entry.option}${entry.quantity > 1 ? ` x${entry.quantity}` : ''}`).join('; ')}`);
  if (brief.visualDesign) lines.push(describeCakeVisualDesign(brief.visualDesign));
  lines.push(`CONDICIONES: ${conditions.trim()}`);
  return lines.join('\n');
};
