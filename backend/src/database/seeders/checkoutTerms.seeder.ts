import { CheckoutTerms } from '../models/checkoutTerms.model';
import { defaultCheckoutTerms } from '../../modules/settings/checkoutTerms.defaults';
import { settingsService } from '../../modules/settings/settings.service';

/** Desarrollo con sync y nuevas instalaciones. Nunca reemplaza una publicación existente. */
export const seedCheckoutTerms = async () => {
  if (await CheckoutTerms.findByPk(1, { attributes: ['id'] })) return;
  await CheckoutTerms.findOrCreate({ where: { id: 1 }, defaults: { id: 1, ...defaultCheckoutTerms(await settingsService.getBusinessInfo()) } });
};
