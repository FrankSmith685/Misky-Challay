import { Check, Circle } from 'lucide-react';

interface PasswordStrengthProps {
  password: string;
}

const rules = [
  { label: '8 caracteres', matches: (password: string) => password.length >= 8 },
  { label: 'Una mayúscula', matches: (password: string) => /[A-Z]/.test(password) },
  { label: 'Un número', matches: (password: string) => /\d/.test(password) },
  { label: 'Un símbolo', matches: (password: string) => /[^\w]/.test(password) },
];

/** Retroalimentación común de contraseña para registro y restablecimiento. */
export const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  if (!password) return null;

  const passed = rules.filter((rule) => rule.matches(password)).length;
  const percentage = (passed / rules.length) * 100;
  const label = passed === 4 ? 'Segura' : passed >= 2 ? 'Puede mejorar' : 'Muy débil';

  return (
    <div
      className="mt-2.5 rounded-card border border-line bg-surface-muted p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-neutral-200">
          <div
            className={`h-full rounded-pill transition-[width,background-color] duration-300 ${
              passed === 4 ? 'bg-brand-600' : passed >= 2 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-[11px] font-extrabold text-ink-muted">{label}</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rules.map((rule) => {
          const isValid = rule.matches(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-[11px] ${
                isValid ? 'font-bold text-brand-700' : 'text-ink-muted'
              }`}
            >
              {isValid ? <Check className="size-3" /> : <Circle className="size-2.5" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
