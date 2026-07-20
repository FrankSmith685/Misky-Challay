import { cn } from '@lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-lg',
};

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}

/** Avatar con las iniciales del usuario (sin imagen). */
export const Avatar = ({ name, email, size = 'md', className }: AvatarProps) => {
  const initials = (name?.trim()?.[0] ?? email?.[0] ?? 'U').toUpperCase();

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700',
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
};
