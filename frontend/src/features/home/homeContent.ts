import {
  CalendarDays,
  ChefHat,
  Flame,
  MapPin,
  CakeSlice,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export interface HomeBenefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface HomeStep {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const HOME_BENEFITS: HomeBenefit[] = [
  {
    icon: CakeSlice,
    title: 'Hecha a tu manera',
    description: 'Elige una receta o combina sabores, rellenos y decoración según tu idea.',
  },
  {
    icon: Flame,
    title: 'Precio transparente',
    description: 'Cada tamaño y extra se refleja antes de confirmar tu pedido.',
  },
  {
    icon: CalendarDays,
    title: 'Fecha asegurada',
    description: 'Consulta franjas con capacidad real y reserva la entrega con anticipación.',
  },
];

export const HOME_STEPS: HomeStep[] = [
  {
    number: '01',
    icon: MapPin,
    title: 'Confirma tu zona',
    description: 'Comprobamos si llegamos a tu dirección y qué sucursal puede atenderte.',
  },
  {
    number: '02',
    icon: ChefHat,
    title: 'Elige o diseña',
    description: 'Pide una receta lista o crea una torta única, paso a paso y sin sorpresas.',
  },
  {
    number: '03',
    icon: Truck,
    title: 'Recíbela a tiempo',
    description: 'Consulta el estado del pedido desde producción hasta la entrega.',
  },
];
