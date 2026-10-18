/**
 * Politique de mot de passe de CoachSen (inscription et changement de mot de passe).
 * Longueur d'abord (10 caractères minimum), puis refus des mots de passe évidents : liste de mots de passe courants,
 * suites et répétitions, mot de passe construit sur l'adresse e-mail ou le nom. Pas de règle « une majuscule, un symbole »
 * qui pousserait à des mots de passe prévisibles : une phrase de passe est la bienvenue.
 * Ne s'applique pas à la connexion : un compte existant doit pouvoir se connecter quel que soit son ancien mot de passe.
 */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

/** Mots de passe très répandus (en français et au Sénégal), comparés sans accents, sans majuscules et sans séparateurs. */
const COMMON = new Set([
  'password', 'password1', 'password123', 'motdepasse', 'motdepasse1', 'motdepasse123', 'azertyuiop', 'azerty123', 'azerty1234',
  'azertyuiop1', 'qwertyuiop', 'qwerty123', 'qwerty1234', 'qwertyuiop1', 'azertyazerty', 'qsdfghjklm', 'wxcvbnazerty',
  '1234567890', '12345678910', '0123456789', '0987654321', '123456789a', 'a123456789', '1q2w3e4r5t', '1qaz2wsx3edc', 'abcdefghij',
  'iloveyou123', 'iloveyou1', 'welcome123', 'bienvenue1', 'bienvenue123', 'admin12345', 'administrateur', 'administrator', 'letmein123',
  'senegal123', 'senegal2024', 'senegal2025', 'senegal2026', 'dakar12345', 'dakar2024', 'dakar2025', 'dakar2026', 'dakardakar',
  'coachsen123', 'coachsen2026', 'coachsen12', 'coach12345', 'coach123456', 'coachcoach', 'monmotdepasse', 'monmotdepasse1',
  'football123', 'footballeur', 'musculation', 'musculation1', 'fitness123', 'sport12345', 'bismillah1', 'bismillah12', 'alhamdulilah',
  'changeme123', 'changemoi123', 'trustno1234', 'passw0rd123', 'p@ssword123', 'p@ssw0rd12',
])

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Suite évidente (abcdefghij, 1234567890, 9876543210) ou un seul motif répété (abababab, 1111111111). */
function isPattern(value: string): boolean {
  const v = value.toLowerCase()
  const distinct: Record<string, true> = {}
  for (let i = 0; i < v.length; i++) distinct[v[i]] = true
  if (Object.keys(distinct).length <= 3) return true
  // Suite montante ou descendante d'un pas de 1 sur toute la longueur
  const step = v.charCodeAt(1) - v.charCodeAt(0)
  if (Math.abs(step) === 1) {
    let all = true
    for (let i = 1; i < v.length; i++) if (v.charCodeAt(i) - v.charCodeAt(i - 1) !== step) { all = false; break }
    if (all) return true
  }
  // Motif répété
  for (let size = 1; size <= Math.floor(v.length / 2); size++) {
    if (v.length % size === 0 && v.slice(0, size).repeat(v.length / size) === v) return true
  }
  return false
}

export interface PasswordContext { email?: string; nom?: string; prenom?: string }

/** Renvoie le motif du refus, en français, ou null si le mot de passe convient. */
export function passwordProblem(password: string, context: PasswordContext = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Utilisez au moins ${PASSWORD_MIN} caractères.`
  if (password.length > PASSWORD_MAX) return `Maximum ${PASSWORD_MAX} caractères.`
  const plain = normalize(password)
  if (COMMON.has(plain)) return 'Ce mot de passe est trop courant : choisissez-en un autre.'
  if (isPattern(password)) return 'Évitez les suites (1234, abcd) et les répétitions.'
  const local = normalize((context.email ?? '').split('@')[0] ?? '')
  for (const part of [local, normalize(context.prenom ?? ''), normalize(context.nom ?? '')]) {
    if (part.length >= 4 && plain.includes(part)) return 'Ne construisez pas le mot de passe sur votre nom ou votre adresse e-mail.'
  }
  return null
}
