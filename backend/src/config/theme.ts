export type ThemeFontFamily = 'inter' | 'system' | 'serif';
export type ThemeDensity = 'comfortable' | 'compact';

export interface ThemeTokens {
  primary: string;
  secondary: string;
  tertiary: string;
  radius: number;
  fontFamily: ThemeFontFamily;
  baseFontSize: number;
  density: ThemeDensity;
  shadowStrength: number;
}

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  primary: '#006fb9',
  secondary: '#ffbd16',
  tertiary: '#f15b3a',
  radius: 5,
  fontFamily: 'inter',
  baseFontSize: 16,
  density: 'comfortable',
  shadowStrength: 100,
};
