import { Skeleton } from '@components/ui/Skeleton';

/** Placeholder con la forma de una ProductCard (media 4:3 + contenido + CTA). */
export const ProductCardSkeleton = () => (
  <div className="overflow-hidden rounded-card border border-line bg-surface">
    <Skeleton className="aspect-[4/3] w-full rounded-none" />
    <div className="grid gap-3 p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-10 w-full rounded-field" />
    </div>
  </div>
);

/** Cuadrícula de skeletons con la misma forma que la grilla de productos. */
export const ProductGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6">
    {Array.from({ length: count }).map((_, index) => (
      <ProductCardSkeleton key={index} />
    ))}
  </div>
);
