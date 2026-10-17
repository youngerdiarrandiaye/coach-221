/**
 * Nom du coach tel qu'il est montré partout dans CoachSen : « Coach » suivi du prénom du profil
 * (ex. « Coach Mansour », « Coach Boufit »). Même règle côté serveur : src/lib/coachName.ts.
 *
 * - Prénom absent : on prend le nom de famille ; les deux absents : « Coach » seul.
 * - Un prénom qui commence déjà par « Coach » n'est pas doublé (« Coach DO » reste « Coach DO »).
 * - Un prénom qui n'est que « Coach » (profil de démonstration) laisse la place au nom de famille.
 */
export function coachLabel(prenom?: unknown, nom?: unknown): string {
  const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const strip = (value: string) => value.replace(/^coach\b\s*/i, '').trim();
  const rest = strip(clean(prenom)) || strip(clean(nom));
  return rest ? `Coach ${rest}` : 'Coach';
}

/** Initiale pour l'avatar : celle du nom affiché sans le mot « Coach » (Coach Mansour -> M). */
export function coachInitial(prenom?: unknown, nom?: unknown): string {
  const rest = coachLabel(prenom, nom).replace(/^Coach\s*/, '');
  return (rest.charAt(0) || 'C').toUpperCase();
}
