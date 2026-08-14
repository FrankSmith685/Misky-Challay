import {
  CalendarDays,
  ChefHat,
  Flame,
  MapPin,
  Salad,
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
    icon: Salad,
    title: 'Hecho a tu manera',
    description: 'Elige una receta o combina cada ingrediente según tu antojo.',
  },
  {
    icon: Flame,
    title: 'Nutrición transparente',
    description: 'Calorías y macros visibles antes de añadir tu bowl al carrito.',
  },
  {
    icon: CalendarDays,
    title: 'A la hora que prefieras',
    description: 'Pide para ahora o reserva una franja que encaje con tu día.',
  },
];

export const HOME_STEPS: HomeStep[] = [
  {
    number: '01',
    icon: MapPin,
    title: 'Confirma tu zona',
    description: 'Validamos cobertura y elegimos la cocina que puede atenderte mejor.',
  },
  {
    number: '02',
    icon: ChefHat,
    title: 'Elige o crea',
    description: 'Pide una receta lista o arma un bowl único, paso a paso y sin sorpresas.',
  },
  {
    number: '03',
    icon: Truck,
    title: 'Síguelo hasta tu puerta',
    description: 'Consulta el estado del pedido desde cocina hasta la entrega.',
  },
];
