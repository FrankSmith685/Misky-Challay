import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' pinta el CTA en rojo y cambia el icono. Por defecto, 'default'. */
  tone?: 'danger' | 'default';
  /** Etiqueta del campo de motivo. Su sola presencia muestra el campo. */
  reasonLabel?: string;
  /** Ayuda contextual bajo el motivo; por defecto solo afirma que se registra. */
  reasonHint?: string;
  /** Sin motivo escrito no se habilita el CTA (cancelar pedido, cancelar ticket). */
  reasonRequired?: boolean;
  reasonMinLength?: number;
  reasonMaxLength?: number;
  /** Texto que hay que teclear literalmente para habilitar el CTA (ej. el email al conceder superadmin). */
  requireTypedText?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  /** Cadena vacia si no se pidio motivo o si se cancelo. Ya viene recortada. */
  reason: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const CANCELLED: ConfirmResult = { confirmed: false, reason: '' };

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * CONFIRMACION DE ACCIONES IRREVERSIBLES
 * ---------------------------------------------------------------------------
 * Un unico dialogo montado en `app/providers.tsx` y consumido con `await`:
 *
 *   const confirm = useConfirm();
 *   const { confirmed, reason } = await confirm({ title, message, tone: 'danger' });
 *   if (!confirmed) return;
 *
 * Se resuelve como promesa (y no con estado local por pantalla) porque cada
 * accion destructiva vive dentro de un handler que ya es asincrono: asi la
 * confirmacion es una linea mas del flujo y no obliga a partir el handler en dos
 * ni a duplicar un <Modal> en cada archivo.
 *
 * Tres grados de friccion segun lo que este en juego:
 *   - solo confirmar          -> apagar un cupon
 *   - motivo obligatorio      -> cancelar un pedido pagado, cancelar un ticket
 *   - texto tecleado          -> conceder superadmin (se teclea el email)
 */
export const ConfirmDialogProvider = ({ children }: { children: ReactNode }) => {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const resolverRef = useRef<((result: ConfirmResult) => void) | null>(null);

  /* `request` NO se limpia al cerrar: el dialogo tiene animacion de salida y
   * vaciarlo aqui deja medio segundo de tarjeta sin titulo ni mensaje. */
  const settle = useCallback((result: ConfirmResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setIsOpen(false);
    resolve?.(result);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // Si ya habia una pregunta abierta se cancela: dejar su promesa colgada
    // bloquearia para siempre al `await` que la esta esperando.
    resolverRef.current?.(CANCELLED);
    resolverRef.current = null;
    setReason('');
    setTyped('');
    setRequest(options);
    setIsOpen(true);
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const isDanger = request?.tone === 'danger';
  const showReason = Boolean(request?.reasonLabel) || Boolean(request?.reasonRequired);
  const reasonLength = reason.trim().length;
  const reasonTooShort = reasonLength < (request?.reasonMinLength ?? (request?.reasonRequired ? 1 : 0));
  const reasonTooLong = request?.reasonMaxLength !== undefined && reasonLength > request.reasonMaxLength;
  // Comparacion laxa: lo que se teclea suele ser un email, y exigir mayusculas
  // exactas seria una trampa sin ninguna ganancia de seguridad.
  const typedMatches =
    !request?.requireTypedText
    || typed.trim().toLowerCase() === request.requireTypedText.trim().toLowerCase();
  const canConfirm = !reasonTooShort && !reasonTooLong && typedMatches;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        isOpen={isOpen}
        onClose={() => settle(CANCELLED)}
        title={request?.title ?? ''}
        eyebrow={isDanger ? 'Acción sensible' : 'Confirmación'}
        icon={isDanger ? AlertTriangle : HelpCircle}
        tone={isDanger ? 'danger' : 'brand'}
        maxWidth="xs"
        // Cancelar es la salida segura, pero un toque fuera del dialogo no debe
        // llevarse el motivo ya escrito. La tecla Escape sigue cerrando.
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" onClick={() => settle(CANCELLED)}>
              {request?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              variant={isDanger ? 'danger' : 'primary'}
              disabled={!canConfirm}
              onClick={() => settle({ confirmed: true, reason: reason.trim() })}
            >
              {request?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-ink">{request?.message}</p>

        {showReason && (
          <div className="mt-5">
            <Textarea
              autoFocus
              rows={3}
              maxLength={request?.reasonMaxLength}
              label={request?.reasonLabel ?? 'Motivo'}
              error={reasonLength > 0 && reasonTooShort ? `Escribe al menos ${request?.reasonMinLength ?? 1} caracteres.` : reasonTooLong ? `Usa hasta ${request?.reasonMaxLength} caracteres.` : undefined}
              hint={
                request?.reasonHint ?? (request?.reasonRequired
                  ? 'Obligatorio. Queda registrado junto a esta acción.'
                  : 'Opcional. Queda registrado junto a esta acción.')
              }
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}

        {request?.requireTypedText && (
          <div className="mt-5">
            <Input
              autoFocus={!showReason}
              label="Confirmación"
              autoComplete="off"
              hint={`Escribe ${request.requireTypedText} para habilitar el botón.`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
};

/** Devuelve la funcion que abre el dialogo y resuelve con la decision del usuario. */
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = (): ConfirmFn => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm debe usarse dentro de <ConfirmDialogProvider>');
  }
  return confirm;
};
