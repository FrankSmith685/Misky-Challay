import { catalogApi } from '@features/catalog/services/catalog.service';
import type { Product } from '@features/catalog/types';
import { useEffect, useState } from 'react';
import { customerJourneyApi, type CustomerCare } from '@services/customerJourney';
import { Textarea } from '@components/ui/Textarea';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
export function CustomerCareSettings() {
  const [products, setProducts] = useState<Product[]>([]);
  const [data, setData] = useState<CustomerCare | null>(null);
  const [error, setError] = useState('');
  const [productId, setProductId] = useState('');
  const [instructions, setInstructions] = useState('');
  const load = () =>
    customerJourneyApi
      .care()
      .then(setData)
      .catch((cause) => setError(getApiErrorMessage(cause)));
  useEffect(() => {
    void load();
    void catalogApi
      .getProducts()
      .then(setProducts)
      .catch(() => undefined);
  }, []);
  return (
    <section className="space-y-4 rounded-card border border-line bg-white p-5">
      <h2 className="text-lg font-bold">Conservación y posventa</h2>
      <p className="text-sm text-ink-muted">
        Publica instrucciones generales y específicas por producto. El cliente las consultará en su
        pedido.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <Textarea
            label="Indicaciones generales de posventa"
            value={data.content}
            maxLength={6000}
            onChange={(event) => setData({ ...data, content: event.target.value })}
          />
          <label className="grid gap-2 text-sm">
            Producto
            <select
              className="rounded-field border border-line p-2"
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setInstructions(data.productInstructionsJson[event.target.value] ?? '');
              }}
            >
              <option value="">Elegir producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            label="Indicaciones del producto"
            maxLength={3000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={!/^[1-9]\d*$/.test(productId)}
            onClick={() =>
              setData({
                ...data,
                productInstructionsJson: {
                  ...data.productInstructionsJson,
                  [productId]: instructions,
                },
              })
            }
          >
            Añadir indicaciones a la publicación
          </Button>
          <ul className="text-sm">
            {Object.entries(data.productInstructionsJson).map(([id, text]) => (
              <li key={id}>
                {products.find((product) => product.id === Number(id))?.name ?? 'Producto retirado'}
                : {text}
                <button
                  className="ml-3 underline"
                  onClick={() => {
                    const next = { ...data.productInstructionsJson };
                    delete next[id];
                    setData({ ...data, productInstructionsJson: next });
                  }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <Button
            onClick={() =>
              void customerJourneyApi
                .publishCare(data)
                .then((result) => {
                  setData(result);
                  setError('');
                })
                .catch((cause) => setError(getApiErrorMessage(cause)))
            }
          >
            Publicar instrucciones
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={() => void load()}>
        Recargar publicación
      </Button>
    </section>
  );
}
