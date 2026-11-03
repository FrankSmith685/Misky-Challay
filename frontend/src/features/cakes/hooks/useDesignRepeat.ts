import { useEffect, useState } from 'react';
import { cakesApi, type DesignRequest } from '../cakes.service';
import { getApiErrorMessage } from '@services/api/client';

export type DesignRepeat = {
  request: DesignRequest;
  references: Array<{ name: string; dataUrl: string }>;
};
const read = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pudimos recuperar la referencia.'));
    reader.readAsDataURL(blob);
  });

/** En la URL solo viaja el identificador; cada cuenta vuelve a autorizar los archivos. */
export function useDesignRepeat(id: string | null, userId: number | undefined, productId?: number) {
  const [state, setState] = useState<{ key: string; value?: DesignRepeat; error?: string }>({
    key: '',
  });
  const key = `${userId}:${productId}:${id}`;
  useEffect(() => {
    let active = true;
    if (!id || !userId || !productId) return;
    void (async () => {
      const request = (await cakesApi.myDesigns()).find(
        (entry) => String(entry.id) === id && entry.productId === productId,
      );
      if (!request) throw new Error('Esta solicitud no está disponible en tu cuenta.');
      const blobs = request.hasReference
        ? [
            await cakesApi.reference(request.id),
            ...(await Promise.all(
              (request.referenceIds ?? []).map((referenceId) =>
                cakesApi.referenceAttachment(request.id, referenceId),
              ),
            )),
          ]
        : [];
      const urls = [...new Set(await Promise.all(blobs.map(read)))].slice(0, 3);
      if (active)
        setState({
          key,
          value: {
            request,
            references: urls.map((dataUrl, i) => ({
              name: `Referencia anterior ${i + 1}`,
              dataUrl,
            })),
          },
        });
    })().catch((error) => {
      if (active) setState({ key, error: getApiErrorMessage(error) });
    });
    return () => {
      active = false;
    };
  }, [id, userId, productId, key]);
  return {
    value: state.key === key ? state.value : undefined,
    error: state.key === key ? state.error : undefined,
    pending: Boolean(id && userId && productId && state.key !== key),
  };
}
