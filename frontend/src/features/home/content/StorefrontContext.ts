import { createContext, useContext } from 'react';
import { defaultStorefront } from './storefront.schema';
import type { StorefrontState } from './storefront.service';

export const storefrontFallback: StorefrontState = {
  content: defaultStorefront(),
  version: 0,
  updatedAt: null,
};
export const StorefrontContext = createContext({
  ...storefrontFallback,
  replace: (_state: StorefrontState) => {},
});
export const useStorefront = () => useContext(StorefrontContext);
