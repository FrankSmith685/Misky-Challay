import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Pagination } from '@components/ui/Pagination';
import type { CakeConfiguration } from '../cakes.service';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const PAGE_SIZE = 8;

export const CakeProductPicker = ({ products, selectedId, onSelect }: {
  products: CakeConfiguration[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) => {
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [page, setPage] = useState(1);
  const selected = products.find((entry) => entry.product.id === selectedId);
  const matches = products.filter((entry) => normalize(entry.product.name).includes(normalize(query.trim())))
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'es', { sensitivity: 'base' }));
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const pageItems = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [query]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <Card className="p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Producto de trabajo</p><h2 className="mt-1 truncate text-lg font-black text-ink">{selected?.product.name ?? 'Elige un producto'}</h2><p className="mt-1 text-sm text-ink-muted">La receta y los tiempos que edites debajo corresponden solo a este producto.</p></div>
      {selected && <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setChoosing((current) => !current)}>{choosing ? 'Cerrar selección' : 'Cambiar producto'}</Button>}
    </div>
    {(!selected || choosing) && <div className="mt-4 border-t border-line pt-4">
      {products.length === 0 ? <p className="text-sm text-ink-muted">No hay productos configurados. Crea uno desde Catálogo.</p> : <>
        <label className="block text-xs font-bold text-ink-muted">Buscar producto
          <span className="relative mt-1 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escribe el nombre" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm font-normal text-ink sm:max-w-md" /></span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Resultados de productos">
          {pageItems.map((entry) => <Button className="w-full justify-start sm:w-auto" key={entry.product.id} size="sm" variant={entry.product.id === selectedId ? 'secondary' : 'outline'} onClick={() => { onSelect(entry.product.id); setChoosing(false); setQuery(''); }}>{entry.product.name}</Button>)}
        </div>
        {matches.length === 0 && <p className="mt-2 text-sm text-ink-muted">No hay productos con ese nombre.</p>}
        {matches.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><p className="text-xs text-ink-muted">Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, matches.length)} de {matches.length} productos</p><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
      </>}
    </div>}
  </Card>;
};
