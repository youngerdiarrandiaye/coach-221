// scripts/build-mail-templates.mjs
// Génère les e-mails de l'authentification (modèles Go de GoTrue / Supabase) dans deploy/mail/*.html, à partir d'une
// seule mise en page. Les fichiers sont servis par le site (nginx, /mail/...) : le Supabase les télécharge à chaque envoi
// grâce aux variables MAILER_TEMPLATES_* (voir docs/EMAILS.md). Aucun secret : seulement des variables de modèle.
// Usage : node scripts/build-mail-templates.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const out = new URL('../deploy/mail/', import.meta.url)
// Lien à jeton : fonctionne depuis n'importe quel appareil et ouvre directement la session (route /auth/confirm).
const link = (type, next) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}&amp;next=${next}`
const hello = 'Bonjour{{ if .Data.prenom }} {{ .Data.prenom }}{{ end }},'

const TEMPLATES = {
  confirmation: { title: 'Confirmez votre adresse e-mail', intro: `${hello}<br>merci d’avoir créé votre espace CoachSen. Pour l’activer, confirmez votre adresse e-mail.`, button: 'Confirmer mon adresse e-mail', url: link('email', '/dashboard'), note: 'Ce lien est valable 24 heures.' },
  recovery: { title: 'Réinitialisez votre mot de passe', intro: `${hello}<br>vous avez demandé à changer votre mot de passe CoachSen. Touchez le bouton pour en choisir un nouveau.`, button: 'Choisir un nouveau mot de passe', url: link('recovery', '/update-password'), note: 'Ce lien est valable 1 heure et ne sert qu’une fois.' },
  magic_link: { title: 'Votre lien de connexion', intro: `${hello}<br>voici votre lien pour vous connecter à CoachSen sans mot de passe.`, button: 'Me connecter', url: link('magiclink', '/dashboard'), note: 'Ce lien ne sert qu’une fois.' },
  invite: { title: 'Vous êtes invité sur CoachSen', intro: `${hello}<br>on vous a invité à rejoindre CoachSen, l’application des coachs sportifs.`, button: 'Accepter l’invitation', url: link('invite', '/dashboard'), note: 'Ce lien est valable 24 heures.' },
  email_change: { title: 'Confirmez votre nouvelle adresse e-mail', intro: `${hello}<br>vous avez demandé à utiliser cette adresse pour votre compte CoachSen. Confirmez le changement.`, button: 'Confirmer la nouvelle adresse', url: link('email_change', '/dashboard'), note: 'Si vous n’avez rien demandé, votre compte reste inchangé.' },
}

const layout = t => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#f2f3f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="background:#0a0a0a;border-radius:18px 18px 0 0;padding:22px 28px;">
<span style="font-size:24px;font-weight:800;letter-spacing:-1px;color:#ffffff;">coachsen</span><span style="display:inline-block;width:7px;height:7px;background:#c8f31d;margin-left:3px;"></span>
</td></tr>
<tr><td style="background:#ffffff;padding:32px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0a0a0a;">${t.title}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#33363b;">${t.intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#c8f31d;border-radius:12px;">
<a href="${t.url}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#0a0a0a;text-decoration:none;">${t.button}</a>
</td></tr></table>
<p style="margin:22px 0 6px;font-size:13px;line-height:1.5;color:#5b6068;">${t.note}</p>
<p style="margin:0 0 22px;font-size:13px;line-height:1.5;color:#5b6068;">Le bouton ne marche pas ? Copiez cette adresse dans votre navigateur :<br><span style="word-break:break-all;color:#33363b;">${t.url}</span></p>
</td></tr>
<tr><td style="background:#ffffff;padding:0 28px 28px;border-radius:0 0 18px 18px;">
<p style="margin:0;padding-top:16px;border-top:1px solid #e6e8eb;font-size:12px;line-height:1.5;color:#7b8088;">Vous n’êtes pas à l’origine de cette demande ? Ignorez simplement ce message, rien ne changera.<br>CoachSen · pensé pour les coachs du Sénégal.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`

await mkdir(out, { recursive: true })
for (const [name, t] of Object.entries(TEMPLATES)) await writeFile(new URL(`${name}.html`, out), layout(t))
console.log(`${Object.keys(TEMPLATES).length} modèles écrits dans ${fileURLToPath(out)}`)
