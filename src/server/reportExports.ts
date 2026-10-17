// Rapport mensuel : données (aperçu écran), PDF et lien de secours. Sans accès direct à la base ni au stockage :
// le chargement et le stockage sont injectés (exports.ts branche les vrais ; les tests, des faux).
import { z } from 'zod'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { RapportDocument, type RapportPDFData } from '@/features/progress/RapportPDF'
import { buildReportData, MESSAGE_MAX, REPORT_MONTH_PATTERN, sanitizeMessage, type ReportInput } from '@/lib/reportData'
import { parseTheme, type PdfThemeId } from './pdf/palette'
import { HttpError, readJson, success } from './http'

export const monthSchema = z.string('Mois invalide.').regex(REPORT_MONTH_PATTERN, 'Mois invalide.')

/** Tout ce qu'il faut pour un rapport, déjà restreint au coach connecté par le chargeur. */
export interface ReportSource {
  input: ReportInput
  pdf: Pick<RapportPDFData, 'client' | 'coachNom' | 'entry' | 'prevEntry' | 'sessions' | 'payments'>
  telephone: string | null
  prenom: string
}

export interface ReportStorage {
  upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: unknown }>
  createSignedUrl(path: string, expiresIn: number): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>
}

export interface ReportDeps {
  load(coachId: string, clientId: string, month: string): Promise<ReportSource>
  storage(): ReportStorage
}

const messageSchema = z.string('Message invalide.').transform((raw, ctx) => {
  try { return sanitizeMessage(raw) } catch {
    ctx.addIssue({ code: 'custom', message: `Le message ne doit pas dépasser ${MESSAGE_MAX} caractères.` })
    return z.NEVER
  }
})

export function parseMessage(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  return messageSchema.parse(raw)
}

function pdfResponse(body: Uint8Array, name: string) {
  return new Response(body as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export async function renderReportPdf(source: ReportSource, month: string, message: string | null, theme: PdfThemeId = 'nuit'): Promise<Buffer> {
  const report = buildReportData(source.input)
  const element = createElement(RapportDocument, { data: { ...source.pdf, yearMonth: month, report, message, theme } })
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0])
}

/** Lien WhatsApp de secours : PDF déposé dans le seau privé `exports`, lien signé valable 24 h. */
export async function shareReport(args: { source: ReportSource; buffer: Uint8Array; month: string; coachId: string; clientId: string; storage: ReportStorage }) {
  const { source, buffer, month, coachId, clientId, storage } = args
  if (!source.telephone) throw new HttpError(400, 'PHONE_REQUIRED', 'Téléphone du client manquant.')
  const fileName = `rapport_${clientId}_${month}.pdf`
  const storagePath = `${coachId}/${clientId}/${crypto.randomUUID()}.pdf`
  const upload = await storage.upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })
  if (upload.error) throw new HttpError(502, 'UPLOAD_FAILED', 'Impossible de préparer le rapport.')
  const signed = await storage.createSignedUrl(storagePath, 86400)
  if (signed.error || !signed.data) throw new HttpError(502, 'SIGN_FAILED', 'Impossible de préparer le lien.')
  let phone = source.telephone.replace(/\D/g, '')
  if (phone.length === 9) phone = '221' + phone
  const text = `Bonjour ${source.prenom}, voici votre rapport du mois ${month} : ${signed.data.signedUrl}\nLien valable 24 heures.\n— ${source.pdf.coachNom || 'Coach'}`
  return { waLink: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, fileName }
}

const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }

/** exports/report/:id (PDF), exports/report/:id/data (JSON), exports/report/:id/share (POST). */
export async function handleReport(request: Request, id: string, operation: string | undefined, coachId: string, deps: ReportDeps): Promise<Response> {
  const method = request.method
  const params = new URL(request.url).searchParams
  if (operation === 'data') {
    if (method !== 'GET') return methodError()
    const month = monthSchema.parse(params.get('month'))
    return success(buildReportData((await deps.load(coachId, id, month)).input))
  }
  if (operation === 'share') {
    if (method !== 'POST') return methodError()
    const body = z.object({ month: monthSchema, message: z.unknown().optional(), theme: z.unknown().optional() }).parse(await readJson(request))
    const message = parseMessage(body.message === null ? undefined : body.message)
    const source = await deps.load(coachId, id, body.month)
    if (!source.telephone) throw new HttpError(400, 'PHONE_REQUIRED', 'Téléphone du client manquant.')
    const buffer = await renderReportPdf(source, body.month, message, parseTheme(body.theme))
    return success(await shareReport({ source, buffer, month: body.month, coachId, clientId: id, storage: deps.storage() }))
  }
  if (operation !== undefined) throw new HttpError(404, 'NOT_FOUND', 'Export introuvable.')
  if (method !== 'GET') return methodError()
  const month = monthSchema.parse(params.get('month'))
  const message = parseMessage(params.get('message') ?? undefined)
  const source = await deps.load(coachId, id, month)
  return pdfResponse(new Uint8Array(await renderReportPdf(source, month, message, parseTheme(params.get('theme')))), `rapport_${id}_${month}.pdf`)
}
