import { PageHeader } from './PageHeader';
import type { Crumb } from '@components/ui/Breadcrumbs';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  crumbs?: Crumb[];
}

/**
 * Encabezado de sección: delega en PageHeader (una sola implementación) con un
 * margen inferior algo más compacto. Se conserva por compatibilidad con sus usos.
 */
export const SectionHeading = ({ eyebrow, title, description, crumbs }: SectionHeadingProps) => (
  <PageHeader eyebrow={eyebrow} title={title} description={description} crumbs={crumbs} className="mb-4" />
);
