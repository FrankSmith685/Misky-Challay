import { CheckCircle2, CircleAlert } from 'lucide-react';

interface PasswordMatchStatusProps {
  password: string;
  confirmation: string;
  reserveSpace?: boolean;
}

/** Mensaje dinámico para confirmar dos contraseñas. */
export const PasswordMatchStatus = ({
  password,
  confirmation,
  reserveSpace = true,
}: PasswordMatchStatusProps) => {
  const matches = confirmation.length > 0 && password === confirmation;

  if (!confirmation && !reserveSpace) return null;

  return (
    <div className={`mt-1.5 ${reserveSpace ? 'min-h-5' : ''}`} aria-live="polite">
      {confirmation && (
        <p
          className={`flex items-center gap-1.5 text-[11px] font-bold ${
            matches ? 'text-brand-700' : 'text-amber-700'
          }`}
        >
          {matches ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
          {matches ? 'Las contraseñas coinciden' : 'Aún no coinciden'}
        </p>
      )}
    </div>
  );
};
