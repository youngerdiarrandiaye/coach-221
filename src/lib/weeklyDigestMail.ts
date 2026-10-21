// Résumé hebdomadaire envoyé au client : contenu de l'e-mail (HTML + texte). Fonctions pures, sans accès base ni réseau.
import type { WeekDigest as Week } from '@/lib/clientDigest'

export interface DigestMailInput {
  prenom: string
  coach: string | null
  /** Semaine résumée : la dernière semaine terminée (lundi au dimanche). */
  week: Week
  /** Semaine d'avant, pour l'écart de poids (peut manquer). */
  previousWeek: Week | null
  upcoming: { titre: string; date_heure: string; duree_minutes: number }[]
  /** Adresse de l'espace du client (https://…/espace). */
  spaceUrl: string
}

export interface DigestMail { subject: string; html: string; text: string }

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const nf = (n: number, digits = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(n).replace(/[  ]/g, ' ')
const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T00:00:00Z'))
const when = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' }).format(new Date(iso))

/** Une semaine sans rien à dire (ni séance, ni série, ni pesée, ni séance à venir) n'envoie pas d'e-mail vide. */
export const hasDigestContent = (input: Pick<DigestMailInput, 'week' | 'upcoming'>) =>
  input.week.sessionsDone > 0 || input.week.sets > 0 || input.week.weightKg !== null || input.upcoming.length > 0

export function buildDigestMail(input: DigestMailInput): DigestMail {
  const { week, previousWeek } = input
  const range = `${day(week.start)} au ${day(week.end)}`
  const sessions = week.sessionsDone > 0 ? `${week.sessionsDone} séance${week.sessionsDone > 1 ? 's' : ''} effectuée${week.sessionsDone > 1 ? 's' : ''}` : 'Pas de séance effectuée'
  const subject = `Votre semaine du ${range} : ${week.sessionsDone > 0 ? sessions : 'votre résumé CoachSen'}`

  const weightDelta = week.weightKg !== null && previousWeek?.weightKg != null ? Math.round((week.weightKg - previousWeek.weightKg) * 10) / 10 : null
  const rows: [string, string][] = [
    ['Séances', `${week.sessionsDone} effectuée${week.sessionsDone > 1 ? 's' : ''} sur ${week.sessionsPlanned} prévue${week.sessionsPlanned > 1 ? 's' : ''}`],
    ['Entraînement', week.sets > 0 ? `${week.sets} série${week.sets > 1 ? 's' : ''}, ${nf(week.volumeKg, 0)} kg soulevés` : 'Aucune série enregistrée'],
  ]
  if (week.weightKg !== null) rows.push(['Poids moyen', `${nf(week.weightKg)} kg${weightDelta !== null && weightDelta !== 0 ? ` (${weightDelta > 0 ? '+' : ''}${nf(weightDelta)} kg sur la semaine d’avant)` : ''}`])

  const hello = `Bonjour ${input.prenom},`
  const intro = input.coach ? `voici le résumé de votre semaine avec ${input.coach}.` : 'voici le résumé de votre semaine.'
  const next = input.upcoming.slice(0, 3).map(s => `${s.titre}, ${when(s.date_heure)} (${s.duree_minutes} min)`)

  const text = [
    `${hello} ${intro}`, '',
    `Semaine du ${range}`,
    ...rows.map(([k, v]) => `- ${k} : ${v}`),
    ...(next.length ? ['', 'Prochaines séances :', ...next.map(n => `- ${n}`)] : []),
    '', `Voir mon espace : ${input.spaceUrl}`, '',
    'Vous ne souhaitez plus recevoir ce résumé ? Désactivez-le dans votre espace, sur la page Résumé.',
  ].join('\n')

  const cell = 'padding:10px 0;border-bottom:1px solid #e6e8eb;font-size:15px;line-height:1.45;color:#33363b;'
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f3f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f5;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="background:#0a0a0a;border-radius:18px 18px 0 0;padding:22px 28px;"><span style="font-size:24px;font-weight:800;letter-spacing:-1px;color:#ffffff;">coachsen</span><span style="display:inline-block;width:7px;height:7px;background:#c8f31d;border-radius:50%;margin-left:3px;"></span></td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 8px;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0a0a0a;">Votre semaine du ${esc(range)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#33363b;">${esc(hello)}<br>${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="${cell}font-weight:700;width:120px;">${esc(k)}</td><td style="${cell}">${esc(v)}</td></tr>`).join('')}</table>
${next.length ? `<h2 style="margin:24px 0 8px;font-size:16px;color:#0a0a0a;">Prochaines séances</h2><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:#33363b;">${next.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="background:#c8f31d;border-radius:12px;"><a href="${esc(input.spaceUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#0a0a0a;text-decoration:none;">Voir mon espace</a></td></tr></table>
</td></tr>
<tr><td style="background:#ffffff;padding:0 28px 28px;border-radius:0 0 18px 18px;"><p style="margin:0;padding-top:16px;border-top:1px solid #e6e8eb;font-size:12px;line-height:1.5;color:#7b8088;">Vous ne souhaitez plus recevoir ce résumé ? Désactivez-le dans votre espace, sur la page Résumé.</p></td></tr>
</table></td></tr></table>
</body>
</html>
`
  return { subject, html, text }
}
