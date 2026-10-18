# E-mails de l'authentification (confirmation, mot de passe oublié)

Rédigé le 18 octobre 2026.

## Le parcours d'un nouveau coach

1. Il crée son compte (`/register`) : le Supabase envoie un e-mail **en français** avec un bouton « Confirmer mon adresse e-mail ».
2. L'écran « Vérifiez votre e-mail » affiche l'adresse, rappelle de regarder les courriers indésirables et propose **« Renvoyer l'e-mail »** (attente d'une minute entre deux envois, limitée aussi côté serveur : 5 par heure).
3. Il touche le bouton **depuis n'importe quel appareil** : le lien `/auth/confirm?token_hash=…&type=email` confirme l'adresse **et ouvre directement sa session**, puis le conduit au tableau de bord.
4. Mot de passe oublié : même mécanique (`type=recovery`), il arrive sur « Choisissez un nouveau mot de passe », déjà connecté pour cette étape.
5. Un lien expiré, déjà utilisé ou invalide renvoie sur la connexion avec un message clair (si l'adresse a déjà été confirmée, il suffit de se connecter).

Pourquoi un lien à jeton plutôt que l'échange de code (`/auth/callback`) : le code ne marche que dans le **même navigateur** que l'inscription, ce qui n'arrive presque jamais (on clique depuis sa messagerie). `/auth/callback` reste en place pour les anciens liens.

## Les modèles d'e-mails

- Générés par `node scripts/build-mail-templates.mjs` dans `deploy/mail/` (confirmation, recovery, magic_link, invite, email_change), servis par le site à `https://<site>/mail/<nom>.html`.
- Le Supabase les télécharge à chaque envoi. Réglages du service Supabase (Coolify) :

| Variable | Valeur |
|---|---|
| `MAILER_TEMPLATES_CONFIRMATION` | `https://<site>/mail/confirmation.html` |
| `MAILER_TEMPLATES_RECOVERY` | `https://<site>/mail/recovery.html` |
| `MAILER_TEMPLATES_MAGIC_LINK` | `https://<site>/mail/magic_link.html` |
| `MAILER_TEMPLATES_INVITE` | `https://<site>/mail/invite.html` |
| `MAILER_TEMPLATES_EMAIL_CHANGE` | `https://<site>/mail/email_change.html` |
| `MAILER_SUBJECTS_CONFIRMATION` | `Confirmez votre adresse e-mail CoachSen` |
| `MAILER_SUBJECTS_RECOVERY` | `Réinitialisez votre mot de passe CoachSen` |
| `MAILER_SUBJECTS_MAGIC_LINK` | `Votre lien de connexion CoachSen` |
| `MAILER_SUBJECTS_INVITE` | `Vous êtes invité sur CoachSen` |
| `MAILER_SUBJECTS_EMAIL_CHANGE` | `Confirmez votre nouvelle adresse e-mail` |
| `API_EXTERNAL_URL` | adresse publique du Supabase (sans elle, les liens pointaient vers un nom interne : `http://supabase-kong:8000`) |
| `GOTRUE_SITE_URL` | adresse du site (utilisée par `{{ .SiteURL }}` dans les liens) |

- Variables de modèle utilisées : `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Data.prenom }}` (prénom saisi à l'inscription). Les modèles ont été validés avec le moteur de modèles de Go (celui du Supabase), avec et sans prénom.
- Si le site est arrêté, le Supabase ne peut pas télécharger les modèles et l'envoi échoue : garder `web` démarré.

## L'envoi (SMTP) : ce qui reste à faire

Sans expéditeur SMTP, **aucun e-mail ne part** : les nouveaux coachs ne peuvent pas confirmer leur compte. Variables du service Supabase :

| Variable | Exemple |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` (Gmail) ou `smtp-relay.brevo.com` (Brevo) |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | l'adresse d'envoi (ou l'identifiant SMTP Brevo) |
| `SMTP_PASS` | mot de passe d'application Google, ou clé SMTP Brevo (jamais le mot de passe habituel) |
| `SMTP_ADMIN_EMAIL` | l'adresse qui apparaît comme expéditeur |
| `SMTP_SENDER_NAME` | `CoachSen` |

- **Gmail** : environ 500 e-mails par jour ; l'expéditeur est l'adresse Gmail. Mot de passe d'application : compte Google > Sécurité > Validation en deux étapes > Mots de passe des applications.
- **Brevo** (gratuit, 300 e-mails par jour) : expéditeur validé par un lien reçu sur l'adresse choisie ; meilleure délivrabilité que Gmail pour un usage « application ».
- Le Supabase plafonne lui-même ses e-mails à 30 par heure pour tous (`GOTRUE_RATE_LIMIT_EMAIL_SENT`) : à relever lors d'une vague d'inscriptions.
- Pour une meilleure délivrabilité à terme : un nom de domaine à soi, avec les enregistrements SPF, DKIM et DMARC fournis par le service d'envoi.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Je n'ai rien reçu » | `SMTP_*` absents ou faux ; vérifier les journaux du conteneur d'authentification dans Coolify ; courriers indésirables ; plafond de 30 e-mails par heure |
| Le lien ouvre une page d'erreur | lien expiré ou déjà utilisé (un e-mail renvoyé invalide le précédent) ; `API_EXTERNAL_URL` ou `GOTRUE_SITE_URL` faux |
| Le lien affiche « Impossible d'ouvrir `supabase-kong` » | `API_EXTERNAL_URL` non renseigné |
| Aucun e-mail et l'inscription échoue | modèle injoignable : le site `web` est arrêté ou `MAILER_TEMPLATES_*` pointe sur une mauvaise adresse |
