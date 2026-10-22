// Changement de thème pour n'importe quelle application web (sans framework).
// 1) charger tokens/themes.css   2) appeler initTheme() au démarrage   3) appeler setTheme('corail') depuis un bouton.
const THEMES = { nuit: '#0a0a0a', corail: '#fff4f6', lagon: '#0c0d0e' }   // couleur de la barre du navigateur
const KEY = 'monapp.theme'

export function setTheme(id) {
  if (!(id in THEMES)) id = 'nuit'
  const root = document.documentElement
  if (id === 'nuit') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', id)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEMES[id])
  document.querySelector('meta[name=color-scheme]')?.setAttribute('content', id === 'corail' ? 'light' : 'dark')
  try { localStorage.setItem(KEY, id) } catch { /* stockage indisponible : le thème vaut pour cette visite */ }
}

export function initTheme() {
  let id = 'nuit'
  try { id = localStorage.getItem(KEY) || 'nuit' } catch { /* ignoré */ }
  setTheme(id)
}

// Pour éviter un éclair de mauvais thème au chargement, appelez initTheme() dans un <script> placé dans le <head>,
// avant le premier affichage.
