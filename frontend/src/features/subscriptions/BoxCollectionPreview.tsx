import { Gift } from 'lucide-react';

const PASTRIES = [
  { name: 'Alfajores', src: '/images/pastry/mini-alfajores.png' },
  { name: 'Brownies', src: '/images/pastry/brownie-almendras.png' },
  { name: 'Trufas', src: '/images/pastry/trufas-cacao.png' },
];

export const BoxCollectionPreview = () => <figure className="overflow-hidden rounded-card border border-line bg-white p-4 text-ink shadow-e2 sm:p-6">
  <div className="flex items-center gap-3 border-b border-line pb-4">
    <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-600"><Gift className="size-5" aria-hidden="true" /></span>
    <div><p className="text-sm font-extrabold">Un detalle para compartir</p><p className="mt-1 text-xs text-ink-muted">La colección de cajas mensuales</p></div>
  </div>
  <div className="mt-5 grid grid-cols-3 gap-3">{PASTRIES.map((pastry) => <div key={pastry.name} className="min-w-0 overflow-hidden rounded-card border border-line bg-surface-muted">
    <img src={pastry.src} alt="" width={240} height={180} className="aspect-[4/3] w-full object-contain" />
    <p className="border-t border-line bg-white px-1 py-3 text-center text-[11px] font-bold sm:text-xs">{pastry.name}</p>
  </div>)}</div>
  <figcaption className="mt-4 text-[11px] leading-5 text-ink-muted">Ilustraciones referenciales. Revisa los productos, cantidades y presentaciones de cada plan.</figcaption>
</figure>;
