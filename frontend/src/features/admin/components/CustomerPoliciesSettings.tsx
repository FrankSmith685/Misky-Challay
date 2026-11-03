import { useState } from 'react';
import { Button } from '@components/ui/Button';
import { CheckoutTermsSettings } from './CheckoutTermsSettings';
import { CustomerCareSettings } from './CustomerCareSettings';
export function CustomerPoliciesSettings() {
  const [document, setDocument] = useState<'CHECKOUT' | 'SUBSCRIPTION' | 'CARE'>('CHECKOUT');
  return <div className="space-y-5"><nav aria-label="Políticas del cliente" className="flex flex-wrap gap-2"><Button variant={document === 'CHECKOUT' ? 'primary' : 'outline'} onClick={() => setDocument('CHECKOUT')}>Condiciones de compra</Button><Button variant={document === 'SUBSCRIPTION' ? 'primary' : 'outline'} onClick={() => setDocument('SUBSCRIPTION')}>Condiciones de suscripción</Button><Button variant={document === 'CARE' ? 'primary' : 'outline'} onClick={() => setDocument('CARE')}>Conservación y posventa</Button></nav>{document === 'CARE' ? <CustomerCareSettings /> : <CheckoutTermsSettings key={document} subscription={document === 'SUBSCRIPTION'} />}</div>;
}
