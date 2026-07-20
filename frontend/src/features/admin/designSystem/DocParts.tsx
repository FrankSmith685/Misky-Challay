import type { FC, ReactNode } from 'react';
import { CodeBlock } from '@components/common/CodeBlock';
import { cn } from '@lib/cn';
import { getDoc, type PropDoc } from './componentDocs';

/** Cabecera de una seccion de la documentacion. */
export const SectionHeader: FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="mb-6 border-b border-line pb-4">
    <h2 className="text-2xl font-bold text-ink">{title}</h2>
    <p className="mt-1 text-ink-muted">{description}</p>
  </div>
);

/** Etiqueta pequena en mayusculas para sub-bloques. */
export const Label: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{children}</p>
);

/* -------------------------------------------------------------------------- */
/* Tabla de props                                                             */
/* -------------------------------------------------------------------------- */
const PropsTable: FC<{ props: PropDoc[] }> = ({ props }) => (
  <div>
    <Label>Props principales</Label>
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <th className="px-3 py-2 font-medium">Prop</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Default</th>
            <th className="px-3 py-2 font-medium">Para que sirve</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-3 py-2">
                <code className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">{p.name}</code>
              </td>
              <td className="px-3 py-2">
                <code className="text-xs text-ink-muted">{p.type}</code>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {p.default ? (
                  <code className="text-xs text-ink-muted">{p.default}</code>
                ) : (
                  <span className="text-xs text-ink-muted/60">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-ink-muted">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Ficha de componente                                                        */
/* -------------------------------------------------------------------------- */
type ComponentDocProps = {
  /** Id en COMPONENT_DOCS; trae nombre, descripcion, builtOn y props. */
  docId?: string;
  /** Sobrescriben o completan los metadatos (util si aun no hay ficha). */
  name?: string;
  tag?: string;
  description?: string;
  children: ReactNode;
  code?: string;
  canvasClassName?: string;
};

/**
 * Ficha profesional de un componente: nombre, sobre que esta construido,
 * descripcion, cuando usarlo, demo en vivo, codigo y tabla de props.
 */
export const ComponentDoc: FC<ComponentDocProps> = ({
  docId,
  name,
  tag,
  description,
  children,
  code,
  canvasClassName,
}) => {
  const meta = docId ? getDoc(docId) : undefined;
  const title = name ?? meta?.name ?? docId ?? 'Componente';
  const importTag = tag ?? meta?.import;
  const desc = description ?? meta?.description;

  return (
    <article
      id={docId ? `component-${docId}` : undefined}
      data-component-id={docId}
      className="scroll-mt-6 overflow-hidden rounded-card border border-line bg-surface"
    >
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            {importTag && (
              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                {importTag}
              </code>
            )}
          </div>
          {desc && <p className="mt-1 text-sm text-ink-muted">{desc}</p>}
        </div>
        {meta?.builtOn && (
          <span className="shrink-0 rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[11px] text-ink-muted">
            construido sobre <span className="font-medium text-ink">{meta.builtOn}</span>
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        {meta?.whenToUse && (
          <p className="text-sm text-ink-muted">
            <span className="font-medium text-ink">Cuando usarlo:</span> {meta.whenToUse}
          </p>
        )}

        {/* Demo en vivo */}
        <div>
          <Label>Vista previa</Label>
          <div
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted p-5',
              canvasClassName,
            )}
          >
            {children}
          </div>
        </div>

        {code && <CodeBlock code={code} />}

        {meta && meta.props.length > 0 && <PropsTable props={meta.props} />}
      </div>
    </article>
  );
};
