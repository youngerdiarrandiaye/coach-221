import type { Metadata } from 'next'
import { Download, Users, CalendarDays, CreditCard, Database, FileJson, FileSpreadsheet, Shield } from 'lucide-react'
import { ExportButton } from '@/features/export/ExportButton'
import {
  exportClientsCSV,
  exportSessionsCSV,
  exportPaymentsCSV,
  exportAllJSON,
} from '@/features/export/exportActions'

export const metadata: Metadata = { title: 'Export & Sauvegarde' }
export const dynamic = 'force-dynamic'

const EXPORTS = [
  {
    icon:     Users,
    label:    'Clients',
    desc:     'Liste complète de vos clients actifs avec toutes leurs informations.',
    action:   exportClientsCSV,
    filename: 'teranga-clients.csv',
    color:    '#00FF85',
    format:   'CSV',
    formatIcon: FileSpreadsheet,
  },
  {
    icon:     CalendarDays,
    label:    'Séances',
    desc:     'Historique complet de toutes vos séances avec dates, durées et statuts.',
    action:   exportSessionsCSV,
    filename: 'teranga-seances.csv',
    color:    '#00CFFF',
    format:   'CSV',
    formatIcon: FileSpreadsheet,
  },
  {
    icon:     CreditCard,
    label:    'Paiements',
    desc:     'Tous vos paiements avec montants, méthodes et statuts.',
    action:   exportPaymentsCSV,
    filename: 'teranga-paiements.csv',
    color:    '#FFD600',
    format:   'CSV',
    formatIcon: FileSpreadsheet,
  },
  {
    icon:     Database,
    label:    'Sauvegarde complète',
    desc:     'Backup JSON de toutes vos données — clients, séances et paiements.',
    action:   exportAllJSON,
    filename: 'teranga-backup.json',
    color:    '#7B6FFF',
    format:   'JSON',
    formatIcon: FileJson,
    mimeType: 'application/json',
  },
]

export default function ExportPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.25)' }}
        >
          <Download size={20} style={{ color: '#00FF85' }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Export & Sauvegarde</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Téléchargez vos données en CSV ou JSON</p>
        </div>
      </div>

      {/* Info banner */}
      <div
        className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
        style={{
          background: 'rgba(0,207,255,0.06)',
          border: '1px solid rgba(0,207,255,0.18)',
        }}
      >
        <Shield size={16} className="shrink-0 mt-0.5" style={{ color: '#00CFFF' }} />
        <p className="text-xs leading-relaxed" style={{ color: '#9090B8' }}>
          Les exports contiennent uniquement vos propres données.
          Les fichiers CSV s&apos;ouvrent directement dans Excel ou Google Sheets.
          Le backup JSON peut être utilisé pour restaurer vos données.
        </p>
      </div>

      {/* Export cards */}
      <div className="space-y-3">
        {EXPORTS.map(({ icon: Icon, label, desc, action, filename, color, format, formatIcon: FormatIcon, mimeType }) => (
          <div
            key={filename}
            className="tc-card flex items-center gap-4 p-4"
            style={{
              background: 'linear-gradient(155deg,rgba(18,18,42,0.97) 0%,rgba(10,10,24,0.99) 100%)',
            }}
          >
            {/* Icon */}
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${color}12`, border: `1px solid ${color}26`, boxShadow: `0 0 18px ${color}18` }}
            >
              <Icon size={20} style={{ color }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-black text-white">{label}</p>
                <span
                  className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: `${color}14`, color }}
                >
                  <FormatIcon size={9} />
                  {format}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>

            {/* Button */}
            <ExportButton
              action={action}
              filename={filename}
              label="Télécharger"
              color={color}
              mimeType={mimeType ?? 'text/csv;charset=utf-8;'}
              size="md"
            />
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-muted-foreground/50 text-center pb-2">
        Les exports incluent uniquement les données actives de votre compte.
      </p>
    </div>
  )
}
