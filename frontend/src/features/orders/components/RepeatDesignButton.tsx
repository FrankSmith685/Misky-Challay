import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cakesApi } from '@features/cakes/cakes.service';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { ROUTES } from '@constants/routes';
import { Button } from '@components/ui/Button';
import toast from '@components/mui/MuiToast';
import { getApiErrorMessage } from '@services/api/client';

export function RepeatDesignButton({ quoteId }: { quoteId: number }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      variant="outline"
      isLoading={busy}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void (async () => {
          const source = (await cakesApi.myDesigns()).find((request) =>
            request.quotes.some((quote) => quote.id === quoteId),
          );
          if (!source)
            throw new Error(
              'La solicitud original requiere revisión del equipo. Escríbenos desde este pedido.',
            );
          const products = await catalogApi.getProducts({});
          const product = products.find((entry) => entry.id === source.productId);
          if (!product)
            throw new Error('Esta torta ya no está publicada. Consulta al equipo desde el pedido.');
          navigate(`${ROUTES.cake(product.slug)}?repetirSolicitud=${source.id}`);
        })()
          .catch((error) => toast.error(getApiErrorMessage(error)))
          .finally(() => setBusy(false));
      }}
    >
      Solicitar nueva cotización con este diseño
    </Button>
  );
}
