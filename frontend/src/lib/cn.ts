import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind resolviendo conflictos (px-2 + px-4 -> px-4). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
