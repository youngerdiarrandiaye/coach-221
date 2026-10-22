import { Injectable, signal } from '@angular/core';

export type ThemeId = 'nuit' | 'corail' | 'lagon';
export const THEMES: { id: ThemeId; label: string; hint: string; color: string }[] = [
 { id: 'nuit', label: 'Nuit citron', hint: 'Sombre, vert citron. Idéal en salle.', color: '#0a0a0a' },
 { id: 'corail', label: 'Corail', hint: 'Clair, rose et orange. Idéal en plein jour.', color: '#fff4f6' },
 { id: 'lagon', label: 'Lagon', hint: 'Sombre, anthracite et turquoise. Net et reposant.', color: '#0c0d0e' },
];
const KEY = 'coachsen.theme';
const isTheme = (v: unknown): v is ThemeId => v === 'nuit' || v === 'corail' || v === 'lagon';

/** Applique le thème choisi (attribut data-theme sur <html>) ; le choix est gardé sur l'appareil. */
export function applyTheme(id: ThemeId) {
 const root = document.documentElement;
 if (id === 'nuit') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', id);
 document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEMES.find(t => t.id === id)!.color);
 document.querySelector('meta[name=color-scheme]')?.setAttribute('content', id === 'corail' ? 'light' : 'dark');
}
export function storedTheme(): ThemeId {
 try { const v = localStorage.getItem(KEY); return isTheme(v) ? v : 'nuit'; } catch { return 'nuit'; }
}
@Injectable({ providedIn: 'root' })
export class Theme {
 readonly current = signal<ThemeId>(storedTheme());
 set(id: ThemeId) {
  this.current.set(id); applyTheme(id);
  try { localStorage.setItem(KEY, id); } catch { /* stockage indisponible : le thème vaut pour cette visite */ }
 }
}
