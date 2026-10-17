import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowLeft, Activity, Heart, Ruler, CalendarDays,
  CreditCard, TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { progressDao } from '@/dao/progressDao'
import { sessionDao } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { MonthPicker } from '@/features/progress/MonthPicker'
import { SendRapportButton } from '@/features/progress/SendRapportButton'
import { IMC_LABELS, OBJECTIF_LABELS, METHODE_LABELS } from '@/config/constants'
import {
  getImcZone,
  getFcReposZone,
  getFcEffortZone,
  getMasseGrasseZone,
  getTourTailleZone,
  forecastValue,
  getTendance,
  TENDANCE_META,
  type MetricZone,
  type Tendance,
} from '@/utils/metricZones'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Rapport mensuel' }
}

interface Props {
  params:       { clientId: string }
  searchParams: { mois?: string }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevYM(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function getImcLabel(imc: number) {
  return IMC_LABELS.find(l => imc < l.max)?.label ?? 'N/A'
}

function Delta({ current, previous, unit = '', inverse = false }: {
  current:  number | null | undefined
  previous: number | null | undefined
  unit?:    string
  inverse?: boolean // true = lower is better (poids, taille, FC)
}) {
  if (current == null || previous == null) return null
  const diff = current - previous
  if (diff === 0) return <span style={{ color: '#6A6A9A' }} className="text-[10px] font-bold">—</span>

  const good    = inverse ? diff < 0 : diff > 0
  const color   = good ? '#00FF85' : '#FF3B5C'
  const Icon    = diff > 0 ? TrendingUp : TrendingDown
  const sign    = diff > 0 ? '+' : ''

  return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color }}>
      <Icon size={9} />
      {sign}{diff > 0 ? diff.toFixed(1) : (-diff).toFixed(1).replace('.0', '')} {unit}
    </span>
  )
}

function Section({ icon: Icon, color, title, children }: {
  icon:     React.ElementType
  color:    string
  title:    string
  children: React.ReactNode
}) {
  return (
    <div className="tc-card overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-border"
        style={{ background: `${color}10` }}
      >
        <Icon size={14} style={{ color }} />
        <h2 className="text-xs font-black uppercase tracking-widest" style={{ color }}>
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function MetricRow({ label, value, unit, delta }: {
  label:  string
  value:  string | number | null | undefined
  unit?:  string
  delta?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {delta}
        <span className="text-sm font-bold text-white">
          {value != null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Zone pill ────────────────────────────────────────────────────────────────

function ZonePill({ zone, val, unit }: { zone: MetricZone; val: string; unit?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-black leading-none shrink-0"
      style={{ background: zone.bg, border: `1px solid ${zone.color}35`, color: zone.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: zone.color }} />
      {zone.label}
      <span className="font-medium opacity-75 ml-0.5">{val}{unit ? ` ${unit}` : ''}</span>
    </span>
  )
}

// ─── Forecast row ─────────────────────────────────────────────────────────────

function ForecastRow({
  emoji, label, currentZone, currentVal, unit,
  delta, predictedZone, predictedVal, tendance,
}: {
  emoji:         string
  label:         string
  currentZone:   MetricZone
  currentVal:    string
  unit?:         string
  delta:         number | null
  predictedZone: MetricZone | null
  predictedVal:  string | null
  tendance:      Tendance | null
}) {
  const tm = tendance ? TENDANCE_META[tendance] : null
  const deltaColor = tendance === 'amélioration' ? '#00CC66'
    : tendance === 'attention' ? '#FF8C3B'
    : '#6A6A9A'

  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] shrink-0">{emoji}</span>
        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#6A6A9A' }}>
          {label}
        </span>
        {tm && (
          <span
            className="ml-auto inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-black"
            style={{ background: `${tm.color}18`, color: tm.color }}
          >
            {tm.icon} {tm.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <ZonePill zone={currentZone} val={currentVal} unit={unit} />
        {delta !== null && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: deltaColor }}>
            {delta > 0 ? '+' : ''}{Number.isInteger(delta) ? delta : delta.toFixed(1)}{unit ? ` ${unit}` : ''}/mois
          </span>
        )}
        {predictedZone && predictedVal && (
          <>
            <span className="text-[9px] font-bold" style={{ color: '#3A3A5A' }}>→ prévu</span>
            <ZonePill zone={predictedZone} val={predictedVal} unit={unit} />
          </>
        )}
        {!predictedZone && delta === null && (
          <span className="text-[10px]" style={{ color: '#3A3A5A' }}>
            1 mesure — projection dès le mois suivant
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RapportPage({ params, searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const ym   = /^\d{4}-\d{2}$/.test(searchParams.mois ?? '') ? searchParams.mois! : currentYM()
  const prev = prevYM(ym)

  const [client, entriesCurrent, entriesPrev, sessions, payments] = await Promise.all([
    clientDao.findById(params.clientId, user.id),
    progressDao.findByClientAndMonth(params.clientId, user.id, ym),
    progressDao.findByClientAndMonth(params.clientId, user.id, prev),
    sessionDao.findByClientAndMonth(params.clientId, user.id, ym),
    paymentDao.findByClientAndMonth(params.clientId, user.id, ym),
  ])

  if (!client) notFound()

  const e  = entriesCurrent[0] ?? null   // latest entry this month
  const ep = entriesPrev[0]   ?? null    // latest entry prev month

  // Sessions stats
  const effectuees = sessions.filter(s => s.statut === 'EFFECTUEE').length
  const planifiees = sessions.filter(s => s.statut === 'PLANIFIEE').length
  const annulees   = sessions.filter(s => s.statut === 'ANNULEE').length
  const totalFini  = effectuees + annulees
  const tauxPres   = totalFini > 0 ? Math.round((effectuees / totalFini) * 100) : null

  // Payments
  const payePayments     = payments.filter(p => p.statut === 'PAYE')
  const totalPaye        = payePayments.reduce((s, p) => s + Number(p.montant), 0)
  const enAttente        = payments.filter(p => p.statut === 'EN_ATTENTE').reduce((s, p) => s + Number(p.montant), 0)
  const methodesMap: Record<string, number> = {}
  payePayments.forEach(p => {
    const m = String(p.methode)
    methodesMap[m] = (methodesMap[m] ?? 0) + Number(p.montant)
  })

  // Age client (pour zones FC effort)
  const clientAge = (() => {
    if (!client.date_naissance) return null
    const b = new Date(client.date_naissance)
    const t = new Date()
    let age = t.getFullYear() - b.getFullYear()
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
    return age
  })()

  const hasProgress = e !== null
  const hasActivity = sessions.length > 0 || payments.length > 0

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href={`/progress/${params.clientId}`}
            className="flex h-10 w-10 items-center justify-center rounded-2xl shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <ArrowLeft size={16} style={{ color: '#9090B8' }} />
          </Link>
          <div>
            <h1 className="text-base font-black text-white leading-tight">
              {client.prenom} {client.nom}
            </h1>
            <p className="text-xs text-muted-foreground">Rapport de performance</p>
          </div>
        </div>
        <MonthPicker value={ym} />
      </div>

      {/* ── Mois titre + bouton WhatsApp ── */}
      <div className="flex items-stretch gap-3">
        <div
          className="flex-1 rounded-2xl px-4 py-3 text-center"
          style={{ background: 'rgba(0,255,133,0.06)', border: '1px solid rgba(0,255,133,0.18)' }}
        >
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6A6A9A' }}>Période</p>
          <p className="text-lg font-black text-white capitalize mt-0.5">{fmtMonth(ym)}</p>
          {client.objectif && (
            <p className="text-xs mt-0.5" style={{ color: '#9090B8' }}>
              Objectif : {OBJECTIF_LABELS[client.objectif] ?? client.objectif}
            </p>
          )}
        </div>
        <div className="flex items-center">
          <SendRapportButton clientId={params.clientId} yearMonth={ym} />
        </div>
      </div>

      {!hasProgress && !hasActivity && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm font-semibold text-white/50">Aucune donnée pour ce mois</p>
          <p className="text-xs text-muted-foreground">Ajoute des mesures et planifie des séances pour ce client.</p>
        </div>
      )}

      {/* ── État & Prévision ── */}
      {hasProgress && (() => {
        const sexe = client.sexe as 'HOMME' | 'FEMME' | null
        const rows: React.ReactNode[] = []

        if (e!.imc != null) {
          const cz = getImcZone(e!.imc)
          const pv = forecastValue(e!.imc, ep?.imc)
          const pz = pv != null ? getImcZone(pv) : null
          rows.push(
            <ForecastRow key="imc"
              emoji="⚖️" label="IMC"
              currentZone={cz} currentVal={String(e!.imc)} unit=""
              delta={ep?.imc != null ? parseFloat((e!.imc - ep.imc).toFixed(1)) : null}
              predictedZone={pz}
              predictedVal={pv != null ? String(pv) : null}
              tendance={pz ? getTendance(cz.level, pz.level) : null}
            />
          )
        }

        if (e!.frequence_cardiaque_repos_bpm != null) {
          const cz = getFcReposZone(e!.frequence_cardiaque_repos_bpm, sexe)
          const pv = forecastValue(e!.frequence_cardiaque_repos_bpm, ep?.frequence_cardiaque_repos_bpm)
          const pz = pv != null ? getFcReposZone(Math.round(pv), sexe) : null
          rows.push(
            <ForecastRow key="fc-repos"
              emoji="❤️" label="FC Repos"
              currentZone={cz} currentVal={String(e!.frequence_cardiaque_repos_bpm)} unit="bpm"
              delta={ep?.frequence_cardiaque_repos_bpm != null
                ? e!.frequence_cardiaque_repos_bpm - ep.frequence_cardiaque_repos_bpm : null}
              predictedZone={pz}
              predictedVal={pv != null ? String(Math.round(pv)) : null}
              tendance={pz ? getTendance(cz.level, pz.level) : null}
            />
          )
        }

        if (e!.masse_grasse_pct != null) {
          const cz = getMasseGrasseZone(e!.masse_grasse_pct, sexe)
          const pv = forecastValue(e!.masse_grasse_pct, ep?.masse_grasse_pct)
          const pz = pv != null ? getMasseGrasseZone(pv, sexe) : null
          rows.push(
            <ForecastRow key="graisse"
              emoji="💧" label="% Graisse"
              currentZone={cz} currentVal={String(e!.masse_grasse_pct)} unit="%"
              delta={ep?.masse_grasse_pct != null
                ? parseFloat((e!.masse_grasse_pct - ep.masse_grasse_pct).toFixed(1)) : null}
              predictedZone={pz}
              predictedVal={pv != null ? String(pv) : null}
              tendance={pz ? getTendance(cz.level, pz.level) : null}
            />
          )
        }

        if (e!.tour_taille_cm != null) {
          const cz = getTourTailleZone(e!.tour_taille_cm, sexe)
          const pv = forecastValue(e!.tour_taille_cm, ep?.tour_taille_cm)
          const pz = pv != null ? getTourTailleZone(pv, sexe) : null
          rows.push(
            <ForecastRow key="taille"
              emoji="📏" label="Tour taille"
              currentZone={cz} currentVal={String(e!.tour_taille_cm)} unit="cm"
              delta={ep?.tour_taille_cm != null
                ? parseFloat((e!.tour_taille_cm - ep.tour_taille_cm).toFixed(1)) : null}
              predictedZone={pz}
              predictedVal={pv != null ? String(pv) : null}
              tendance={pz ? getTendance(cz.level, pz.level) : null}
            />
          )
        }

        if (e!.frequence_cardiaque_effort_bpm != null && clientAge != null) {
          const cz = getFcEffortZone(e!.frequence_cardiaque_effort_bpm, clientAge)
          const pv = forecastValue(e!.frequence_cardiaque_effort_bpm, ep?.frequence_cardiaque_effort_bpm)
          const pz = pv != null ? getFcEffortZone(Math.round(pv), clientAge) : null
          rows.push(
            <ForecastRow key="fc-effort"
              emoji="🔥" label="FC Effort"
              currentZone={cz} currentVal={String(e!.frequence_cardiaque_effort_bpm)} unit="bpm"
              delta={ep?.frequence_cardiaque_effort_bpm != null
                ? e!.frequence_cardiaque_effort_bpm - ep.frequence_cardiaque_effort_bpm : null}
              predictedZone={pz}
              predictedVal={pv != null ? String(Math.round(pv)) : null}
              tendance={null}
            />
          )
        }

        if (rows.length === 0) return null

        return (
          <Section icon={TrendingUp} color="#00CFFF" title="État & Prévision">
            <p className="text-[10px] mb-3 leading-relaxed" style={{ color: '#4A4A6A' }}>
              Zones actuelles · tendance linéaire · projection mois suivant
            </p>
            {rows}
          </Section>
        )
      })()}

      {/* ── Composition corporelle ── */}
      {(e?.poids_kg != null || e?.imc != null || e?.masse_grasse_pct != null) && (
        <Section icon={Activity} color="#00FF85" title="Composition corporelle">
          <MetricRow
            label="Poids"
            value={e.poids_kg}
            unit="kg"
            delta={<Delta current={e.poids_kg} previous={ep?.poids_kg} unit="kg"
                          inverse={client.objectif === 'PERTE_DE_POIDS'} />}
          />
          {e.imc != null && (
            <MetricRow
              label="IMC"
              value={e.imc}
              delta={<Delta current={e.imc} previous={ep?.imc} unit=""
                            inverse={client.objectif === 'PERTE_DE_POIDS'} />}
            />
          )}
          {e.imc != null && (
            <MetricRow label="Catégorie IMC" value={getImcLabel(e.imc)} />
          )}
          {e.masse_grasse_pct != null && (
            <MetricRow
              label="% Masse grasse"
              value={e.masse_grasse_pct}
              unit="%"
              delta={<Delta current={e.masse_grasse_pct} previous={ep?.masse_grasse_pct} unit="%" inverse />}
            />
          )}
          {client.taille_cm && <MetricRow label="Taille" value={client.taille_cm} unit="cm" />}
        </Section>
      )}

      {/* ── Cardio ── */}
      {(e?.frequence_cardiaque_repos_bpm != null || e?.frequence_cardiaque_effort_bpm != null) && (
        <Section icon={Heart} color="#FF3B5C" title="Cardio">
          {e.frequence_cardiaque_repos_bpm != null && (
            <MetricRow
              label="FC Repos"
              value={e.frequence_cardiaque_repos_bpm}
              unit="bpm"
              delta={<Delta current={e.frequence_cardiaque_repos_bpm}
                            previous={ep?.frequence_cardiaque_repos_bpm} unit="bpm" inverse />}
            />
          )}
          {e.frequence_cardiaque_effort_bpm != null && (
            <MetricRow
              label="FC Effort"
              value={e.frequence_cardiaque_effort_bpm}
              unit="bpm"
              delta={<Delta current={e.frequence_cardiaque_effort_bpm}
                            previous={ep?.frequence_cardiaque_effort_bpm} unit="bpm" inverse />}
            />
          )}
        </Section>
      )}

      {/* ── Mensurations ── */}
      {(e?.tour_taille_cm != null || e?.hanches_cm != null ||
        e?.bras_cm != null || e?.cuisse_cm != null) && (
        <Section icon={Ruler} color="#00CFFF" title="Mensurations">
          {e.tour_taille_cm != null && (
            <MetricRow
              label="Tour de taille"
              value={e.tour_taille_cm}
              unit="cm"
              delta={<Delta current={e.tour_taille_cm} previous={ep?.tour_taille_cm} unit="cm" inverse />}
            />
          )}
          {e.hanches_cm != null && (
            <MetricRow
              label="Hanches"
              value={e.hanches_cm}
              unit="cm"
              delta={<Delta current={e.hanches_cm} previous={ep?.hanches_cm} unit="cm" />}
            />
          )}
          {e.bras_cm != null && (
            <MetricRow
              label="Bras"
              value={e.bras_cm}
              unit="cm"
              delta={<Delta current={e.bras_cm} previous={ep?.bras_cm} unit="cm" />}
            />
          )}
          {e.cuisse_cm != null && (
            <MetricRow
              label="Cuisse"
              value={e.cuisse_cm}
              unit="cm"
              delta={<Delta current={e.cuisse_cm} previous={ep?.cuisse_cm} unit="cm" />}
            />
          )}
        </Section>
      )}

      {/* ── Séances ── */}
      {sessions.length > 0 && (
        <Section icon={CalendarDays} color="#7B6FFF" title="Séances du mois">
          <MetricRow label="Effectuées"  value={effectuees} />
          <MetricRow label="Planifiées"  value={planifiees} />
          <MetricRow label="Annulées"    value={annulees} />
          {tauxPres !== null && (
            <MetricRow
              label="Taux de présence"
              value={`${tauxPres}%`}
            />
          )}
          {sessions.length > 0 && (
            <div className="mt-3 space-y-1">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between text-xs py-1.5
                                           border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground truncate max-w-[60%]">{s.titre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 tabular-nums">
                      {new Date(s.date_heure).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 font-bold text-[10px]"
                      style={
                        s.statut === 'EFFECTUEE'
                          ? { background: 'rgba(0,255,133,0.15)', color: '#00FF85' }
                          : s.statut === 'ANNULEE'
                          ? { background: 'rgba(255,59,92,0.15)', color: '#FF3B5C' }
                          : { background: 'rgba(123,111,255,0.15)', color: '#7B6FFF' }
                      }
                    >
                      {s.statut === 'EFFECTUEE' ? 'Effectuée'
                        : s.statut === 'ANNULEE' ? 'Annulée' : 'Planifiée'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Paiements ── */}
      {payments.length > 0 && (
        <Section icon={CreditCard} color="#FFD600" title="Paiements du mois">
          <MetricRow
            label="Total encaissé"
            value={totalPaye > 0 ? `${totalPaye.toLocaleString('fr-FR')} FCFA` : '—'}
          />
          {enAttente > 0 && (
            <MetricRow
              label="En attente"
              value={`${enAttente.toLocaleString('fr-FR')} FCFA`}
            />
          )}
          {Object.entries(methodesMap).map(([methode, total]) => (
            <MetricRow
              key={methode}
              label={METHODE_LABELS[methode] ?? methode}
              value={`${total.toLocaleString('fr-FR')} FCFA`}
            />
          ))}
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between text-xs py-1.5
                                       border-b border-border/30 last:border-0">
              <span className="text-muted-foreground truncate max-w-[55%]">
                {p.description || (METHODE_LABELS[String(p.methode)] ?? String(p.methode))}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-white/40 tabular-nums">
                  {new Date(p.date_paiement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
                <span className="font-bold text-white tabular-nums">
                  {Number(p.montant).toLocaleString('fr-FR')} F
                </span>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* ── Notes de la dernière mesure ── */}
      {e?.notes && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6A6A9A' }}>
            Notes du coach
          </p>
          <p className="text-sm text-white/70 leading-relaxed">{e.notes}</p>
        </div>
      )}

      {/* ── Bouton navigation ── */}
      <div className="flex gap-3">
        <Link
          href={`/progress/${params.clientId}`}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
        >
          <Minus size={14} /> Évolution globale
        </Link>
        <Link
          href={`/progress/${params.clientId}/rapport?mois=${prevYM(ym)}`}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
          style={{ background: 'rgba(0,255,133,0.08)', border: '1px solid rgba(0,255,133,0.22)', color: '#00FF85' }}
        >
          <ArrowLeft size={14} /> Mois précédent
        </Link>
      </div>
    </div>
  )
}
