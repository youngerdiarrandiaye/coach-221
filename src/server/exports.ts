import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { clientDao } from '@/dao/clientDao'
import { sessionDao } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { profileDao } from '@/dao/profileDao'
import { coachLabel } from '@/lib/coachName'
import { progressDao } from '@/dao/progressDao'
import { workoutDao } from '@/dao/workoutDao'
import { monthBounds } from '@/lib/reportData'
import { handleReport, type ReportDeps, type ReportSource, type ReportStorage } from './reportExports'
import { found, HttpError, readMultipart, uuid } from './http'

function file(body: BodyInit, name: string, type: string) {
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
function csv(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value)
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }).join(',')).join('\r\n')
}
const dayOfEntry = (e: { mesure_date: string }) => String(e.mesure_date).slice(0, 10)
const latestIn = <T extends { mesure_date: string; created_at?: string }>(rows: T[], month: string) =>
  rows.filter(e => dayOfEntry(e).slice(0, 7) === month)
    .sort((a, b) => dayOfEntry(b).localeCompare(dayOfEntry(a)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0] ?? null

/** Chargement du rapport : tout est lu pour le coach connecté ; un client étranger donne 404 avant toute autre lecture. */
async function loadReport(coachId: string, id: string, month: string): Promise<ReportSource> {
  const c = found(await clientDao.findById(id, coachId))
  const { end } = monthBounds(month)
  const [y, m] = month.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
  const [profile, progress, sessions, payments, logs] = await Promise.all([
    profileDao.findById(coachId), progressDao.findByClient(id, coachId), sessionDao.findByClientAndMonth(id, coachId, month),
    paymentDao.findByClientAndMonth(id, coachId, month), workoutDao.listRawLogs(coachId, { clientId: id, to: end }),
  ])
  const exerciseIds = Array.from(new Set(logs.filter(l => String(l.log_date).slice(0, 7) === month).map(l => l.exercice_id)))
  const exercises = await workoutDao.listExercisesByIds(coachId, exerciseIds)
  let age: number | null = null
  if (c.date_naissance) {
    const birth = new Date(c.date_naissance), now = new Date()
    age = now.getUTCFullYear() - birth.getUTCFullYear()
    if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--
  }
  const coachNom = profile ? coachLabel(profile.prenom, profile.nom) : null
  return {
    input: { client: { id: c.id, prenom: c.prenom, nom: c.nom, objectif: c.objectif }, month, coach: coachNom, sessions, logs, exercises, progress },
    pdf: {
      client: { nom: c.nom, prenom: c.prenom, objectif: c.objectif, taille_cm: c.taille_cm, poids_initial_kg: c.poids_initial_kg, telephone: c.telephone, sexe: c.sexe, age },
      coachNom, entry: latestIn(progress, month), prevEntry: latestIn(progress, prev), sessions, payments,
    },
    telephone: c.telephone, prenom: c.prenom,
  }
}

const reportDeps: ReportDeps = { load: loadReport, storage: () => createAdminSupabaseClient().storage.from('exports') as unknown as ReportStorage }

export async function handleExport(request: Request, path: string[], coachId: string, deps: ReportDeps = reportDeps): Promise<Response> {
  const [kind, rawId, operation] = path
  if (request.method === 'GET' && !rawId) {
    if (kind === 'clients.csv') {
      const rows = await clientDao.findAll(coachId)
      return file(csv([['Prénom', 'Nom', 'Téléphone', 'Email', 'Objectif'], ...rows.map(c => [c.prenom, c.nom, c.telephone, c.email, c.objectif])]), kind, 'text/csv; charset=utf-8')
    }
    if (kind === 'sessions.csv') {
      const rows = await sessionDao.findAll(coachId)
      return file(csv([['Client', 'Titre', 'Date UTC/Dakar', 'Durée', 'Statut', 'Description', 'Notes'], ...rows.map(s => [`${s.clients?.prenom ?? ''} ${s.clients?.nom ?? ''}`, s.titre, s.date_heure, s.duree_minutes, s.statut, s.description, s.notes])]), kind, 'text/csv; charset=utf-8')
    }
    if (kind === 'payments.csv') {
      const rows = await paymentDao.findAll(coachId)
      return file(csv([['Client', 'Montant FCFA', 'Méthode', 'Statut', 'Date', 'Description'], ...rows.map(p => [`${p.clients?.prenom ?? ''} ${p.clients?.nom ?? ''}`, p.montant, p.methode, p.statut, p.date_paiement, p.description])]), kind, 'text/csv; charset=utf-8')
    }
    if (kind === 'all.json') {
      const [clients, sessions, payments, progress, recurrences, profile] = await Promise.all([clientDao.findAll(coachId), sessionDao.findAll(coachId), paymentDao.findAll(coachId), progressDao.findAll(coachId), sessionRecurrenceDao.findAll(coachId), profileDao.findById(coachId)])
      return file(JSON.stringify({ exportedAt: new Date().toISOString(), version: '1.0', clients, sessions, payments, progress, recurrences, profile }, null, 2), kind, 'application/json')
    }
  }
  const id = uuid(rawId)
  if (kind === 'report') return handleReport(request, id, operation, coachId, deps)
  if (request.method === 'GET' && (kind === 'client' || kind === 'payment')) {
    const profile = found(await profileDao.findById(coachId))
    if (kind === 'payment') {
      const payment = found(await paymentDao.findById(id, coachId))
      const client = found(await clientDao.findById(payment.client_id, coachId))
      const { buildPaymentPdf } = await import('./pdf/buildPaymentPdf')
      return file(await buildPaymentPdf(payment, client, profile, new URL(request.url).searchParams.get('theme')), `payment_${id}.pdf`, 'application/pdf')
    }
    const client = found(await clientDao.findById(id, coachId))
    const [sessions, payments] = await Promise.all([sessionDao.findByClient(id, coachId), paymentDao.findByClient(id, coachId)])
    const { buildClientPdf } = await import('./pdf/buildClientPdf')
    return file(await buildClientPdf(client, sessions, payments, coachLabel(profile.prenom, profile.nom), new URL(request.url).searchParams.get('theme')), `client_${id}.pdf`, 'application/pdf')
  }
  throw new HttpError(404, 'NOT_FOUND', 'Export introuvable.')
}

import { sessionRecurrenceDao } from '@/dao/sessionRecurrenceDao'
export async function uploadAvatar(request: Request, coachId: string) {
  if (Number(request.headers.get('content-length') ?? 0) > 6 * 1024 * 1024) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Image trop volumineuse.')
  const form = await readMultipart(request)
  const avatar = form.get('avatar')
  if (!(avatar instanceof File) || !avatar.size || avatar.size > 5 * 1024 * 1024) throw new HttpError(400, 'INVALID_AVATAR', 'Choisissez une image de moins de 5 Mo.')
  const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const ext = types[avatar.type]
  if (!ext) throw new HttpError(400, 'INVALID_AVATAR', 'Formats acceptés : JPEG, PNG et WebP.')
  const bytes = new Uint8Array(await avatar.arrayBuffer())
  const valid = ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ext === 'png' ? [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b) : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP'
  if (!valid) throw new HttpError(400, 'INVALID_AVATAR', 'Le fichier ne correspond pas à son format.')
  const storage = createAdminSupabaseClient().storage.from('avatars')
  const path = `${coachId}/avatar.${ext}`
  const upload = await storage.upload(path, bytes, { contentType: avatar.type, upsert: true })
  if (upload.error) throw new HttpError(502, 'UPLOAD_FAILED', 'Impossible de sauvegarder votre image.')
  const url = `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  await profileDao.update(coachId, { avatar_url: url })
  return { url }
}
