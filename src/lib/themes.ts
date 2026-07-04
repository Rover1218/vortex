export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  /** [background, accent, secondary] preview dots */
  swatch: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { id: 'vortex', name: 'Vortex', description: 'Warm amber on cinematic black', swatch: ['#09090b', '#f5a623', '#2dd4a7'] },
  { id: 'terminal', name: 'Terminal', description: 'Phosphor green console, mono type', swatch: ['#030804', '#33ff66', '#d0ffd8'] },
  { id: 'synthwave', name: 'Synthwave', description: 'Neon pink retro-future', swatch: ['#0d0420', '#ff3eb4', '#36e2ff'] },
  { id: 'ocean', name: 'Ocean', description: 'Cool cyan depths', swatch: ['#050b14', '#38bdf8', '#7dd3fc'] },
  { id: 'crimson', name: 'Crimson', description: 'Blood-red cinema', swatch: ['#0d0608', '#f43f5e', '#34d399'] },
  { id: 'graphite', name: 'Graphite', description: 'Monochrome silver, zero color', swatch: ['#0a0a0c', '#a8b2c2', '#6ee7b7'] },
  { id: 'aurora', name: 'Aurora', description: 'Northern-lights emerald & ice', swatch: ['#040d0c', '#2de6a8', '#7dd3fc'] },
  { id: 'amethyst', name: 'Amethyst', description: 'Royal violet dusk', swatch: ['#0b0814', '#a78bfa', '#2dd4a7'] },
  { id: 'sakura', name: 'Sakura', description: 'Soft blossom pink', swatch: ['#12090d', '#f9a8d4', '#5eead4'] },
  { id: 'ember', name: 'Ember', description: 'Burning orange heat', swatch: ['#0e0804', '#f97316', '#2dd4a7'] },
  { id: 'arctic', name: 'Arctic', description: 'Frozen ice blue', swatch: ['#070b11', '#93c5fd', '#5eead4'] },
  { id: 'acid', name: 'Acid', description: 'Electric chartreuse', swatch: ['#090b05', '#a3e635', '#34d399'] },
];

export const DEFAULT_THEME = 'vortex';
export const THEME_STORAGE_KEY = 'vortex-theme';

export function applyTheme(id: string): void {
  if (typeof document === 'undefined') return;
  if (id === DEFAULT_THEME) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function getStoredTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored && THEMES.some((t) => t.id === stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}
