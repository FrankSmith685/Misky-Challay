/** Small size diagram; the catalog image remains the product reference. */
export const CakeSizeIllustration = ({ size }: { size: 'small' | 'medium' | 'large' }) => {
  const widths = { small: 25, medium: 32, large: 39 };
  const width = widths[size];
  const left = (48 - width) / 2;
  return <svg width="44" height="36" viewBox="0 0 48 40" fill="none" aria-hidden="true">
    <path d="M7 34h34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    <path d={`M${left} 16v14c0 4 0 4 ${width / 2} 4S${left + width} 34 ${left + width} 30V16`} fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.4" />
    <ellipse cx="24" cy="16" rx={width / 2} ry="5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1.4" />
    <path d={`M${left} 24c5 3 9 3 ${width / 2} 3s${width / 2 - 5} 0 ${width / 2} -3`} stroke="currentColor" strokeWidth="1.2" opacity=".5" />
    <path d="M24 7v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M24 3c2 2 2 3 0 4-2-1-2-2 0-4Z" fill="currentColor" opacity=".6" />
  </svg>;
};
