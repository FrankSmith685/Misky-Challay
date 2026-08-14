import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';

export interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Pestanas tipo "pill" para alternar entre vistas dentro de una misma pantalla. */
export const Tabs = ({ items, value, onChange, className }: TabsProps) => (
  <MuiTabs
    value={value}
    onChange={(_, nextValue: string) => onChange(nextValue)}
    className={className}
    variant="scrollable"
    scrollButtons="auto"
    sx={{ minHeight: 44, borderRadius: 'var(--radius-field)', bgcolor: 'action.hover', p: .5, '& .MuiTab-root': { minHeight: 36, borderRadius: 'var(--radius-field)', px: 2 }, '& .Mui-selected': { bgcolor: 'background.paper', boxShadow: 'var(--shadow-e1)' }, '& .MuiTabs-indicator': { display: 'none' } }}
  >
    {items.map((item) => <MuiTab key={item.value} value={item.value} label={item.label} />)}
  </MuiTabs>
);
