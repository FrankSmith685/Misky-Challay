import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StorefrontContext, storefrontFallback } from './StorefrontContext';
import { storefrontApi, type StorefrontState } from './storefront.service';

export const StorefrontProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState(storefrontFallback);
  const replace = useCallback(
    (value: StorefrontState) =>
      setState((current) => (value.version >= current.version ? value : current)),
    [],
  );
  useEffect(() => {
    let active = true;
    void storefrontApi
      .get()
      .then((value) => {
        if (active) replace(value);
      })
      .catch(() => {
        // A public editorial outage must not block browsing or purchasing.
      });
    return () => {
      active = false;
    };
  }, [replace]);
  return (
    <StorefrontContext.Provider value={{ ...state, replace }}>
      {children}
    </StorefrontContext.Provider>
  );
};
