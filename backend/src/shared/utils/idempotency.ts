import { createHash } from 'node:crypto';

/**
 * CLAVES DE IDEMPOTENCIA
 * ---------------------------------------------------------------------------
 * La clave que envia el cliente NO se guarda tal cual. Se guardaba antes, y eso
 * abria dos agujeros a la vez:
 *
 *   1. El indice es global. Enviar una clave corta y previsible ("12345678")
 *      devolvia el pedido de OTRO usuario: su numero, su total y su checkoutUrl.
 *   2. Pedidos y planes comparten el espacio de claves, asi que una compra de plan
 *      podia "resolverse" con el pedido de otra persona.
 *
 * La clave almacenada se deriva de (ambito + dueno + clave del cliente). Dos
 * usuarios distintos con la misma clave ya no se cruzan, y un pedido nunca colisiona
 * con la compra de un plan. El cliente conserva el control de su reintento, que es
 * justo para lo que sirve la idempotencia.
 */
export type IdempotencyScope = 'order' | 'plan';

export const deriveIdempotencyKey = (
  scope: IdempotencyScope,
  ownerId: number | null,
  clientKey: string,
): string => {
  const owner = ownerId === null ? 'guest' : String(ownerId);
  const digest = createHash('sha256')
    .update(`${scope}:${owner}:${clientKey}`)
    .digest('hex')
    .slice(0, 48);

  // El prefijo legible ayuda a leer la tabla y a depurar; el hash hace el trabajo.
  return `${scope}_${digest}`;
};
