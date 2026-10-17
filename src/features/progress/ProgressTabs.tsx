'use client'

import { useState, useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'
import { Chart, C, baseChart, baseGrid } from '@/components/ui/Chart'
import { HeartBeat } from '@/components/ui/HeartBeat'
import { MetricIcon, METRIC_META } from '@/components/ui/MetricIcon'
import { MetricNorms } from '@/components/ui/MetricNorms'
import type { ProgressEntryRow } from '@/entities'

interface Props {
  entries:       ProgressEntryRow[]
  poidsInitial?: number | null
  clientSexe?:   'HOMME' | 'FEMME' | null
  clientAge?:    number | null
}

type TabKey =
  | 'poids'
  | 'fc_repos'
  | 'fc_effort'
  | 'mensurations'
  | 'imc'
  | 'masse_grasse'

interface TabDef {
  key:    TabKey
  label:  string
  unit:   string
  color:  string
}

const TABS: TabDef[] = [
  { key: 'poids',         label: 'Poids',      unit: 'kg',  color: C.green  },
  { key: 'imc',           label: 'IMC',        unit: '',    color: C.blue   },
  { key: 'fc_repos',      label: 'FC Repos',   unit: 'bpm', color: '#FF3B5C'},
  { key: 'fc_effort',     label: 'FC Effort',  unit: 'bpm', color: '#FF8C3B'},
  { key: 'mensurations',  label: 'Mensur.',    unit: 'cm',  color: C.blue   },
  { key: 'masse_grasse',  label: '% Graisse',  unit: '%',   color: C.purple },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function areaOptions(
  color:      string,
  categories: string[],
  unit:       string,
  min?:       number,
  max?:       number,
  refY?:      number,
): ApexOptions {
  return {
    chart:  { ...baseChart },
    grid:   baseGrid,
    colors: [color],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type:     'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 100] },
    },
    markers: {
      size:         4,
      colors:       [color],
      strokeColors: '#05050F',
      strokeWidth:  2,
      hover:        { size: 6 },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels:     { style: { colors: '#9090B8', fontSize: '11px' }, rotate: 0 },
      tickAmount: categories.length > 6 ? 5 : undefined,
    },
    yaxis: {
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      labels: {
        style:     { colors: '#9090B8', fontSize: '11px' },
        formatter: (v: number) => unit ? `${v} ${unit}` : String(v),
      },
    },
    annotations: refY !== undefined ? {
      yaxis: [{
        y:               refY,
        borderColor:     '#9090B8',
        strokeDashArray: 4,
        label: {
          text:  'Initial',
          style: { color: '#9090B8', background: 'transparent', fontSize: '10px' },
        },
      }],
    } : {},
    tooltip: {
      theme: 'dark',
      y:     { formatter: (v: number) => unit ? `${v} ${unit}` : String(v) },
    },
    dataLabels: { enabled: false },
  }
}

export function ProgressTabs({ entries, poidsInitial, clientSexe, clientAge }: Props) {
  const [active, setActive] = useState<TabKey>('poids')

  const dates = useMemo(
    () => entries.map(e => fmtDate(e.mesure_date)),
    [entries],
  )

  const tabData: Record<TabKey, (number | null)[]> = useMemo(() => ({
    poids:        entries.map(e => e.poids_kg ?? null),
    imc:          entries.map(e => e.imc ?? null),
    fc_repos:     entries.map(e => e.frequence_cardiaque_repos_bpm ?? null),
    fc_effort:    entries.map(e => e.frequence_cardiaque_effort_bpm ?? null),
    masse_grasse: entries.map(e => e.masse_grasse_pct ?? null),
    mensurations: entries.map(e => e.tour_taille_cm ?? null),
  }), [entries])

  const mensurationsMulti = useMemo(() => [
    { name: 'Taille',  data: entries.map(e => e.tour_taille_cm ?? null),  color: '#00CFFF' },
    { name: 'Hanches', data: entries.map(e => e.hanches_cm ?? null),       color: '#7B6FFF' },
    { name: 'Bras',    data: entries.map(e => e.bras_cm ?? null),          color: '#00FF85' },
    { name: 'Cuisse',  data: entries.map(e => e.cuisse_cm ?? null),        color: '#FF8C3B' },
  ].filter(s => s.data.some(v => v !== null)), [entries])

  const hasData = (key: TabKey): boolean => {
    if (key === 'mensurations') return mensurationsMulti.length > 0
    return tabData[key].some(v => v !== null)
  }

  const visibleTabs = TABS.filter(t => hasData(t.key))

  if (visibleTabs.length === 0) return null

  const safeActive = visibleTabs.find(t => t.key === active)?.key ?? visibleTabs[0].key

  function renderChart(key: TabKey) {
    const tab = TABS.find(t => t.key === key)!

    if (key === 'mensurations') {
      const series = mensurationsMulti.map(s => ({ name: s.name, data: s.data }))
      const colors = mensurationsMulti.map(s => s.color)
      const opts: ApexOptions = {
        ...areaOptions(colors[0], dates, 'cm'),
        colors,
        legend: {
          show:   true,
          labels: { colors: '#9090B8' },
          markers: { size: 4 },
        },
      }
      return <Chart type="area" series={series} options={opts} height={180} />
    }

    const raw = tabData[key]
    const nums = raw.filter((v): v is number => v !== null)
    if (nums.length < 2) {
      return (
        <div className="flex h-[180px] items-center justify-center">
          <p className="text-sm" style={{ color: '#6A6A9A' }}>
            Ajoute au moins 2 mesures pour voir l&apos;évolution
          </p>
        </div>
      )
    }

    const pad = (nums.reduce((a, b) => Math.max(a, b)) - nums.reduce((a, b) => Math.min(a, b))) * 0.1 || 2
    const min = Math.floor(Math.min(...nums) - pad)
    const max = Math.ceil(Math.max(...nums) + pad)

    const refY = key === 'poids' && poidsInitial ? poidsInitial : undefined

    const opts = areaOptions(tab.color, dates, tab.unit, min, max, refY)
    const series = [{ name: tab.label, data: raw }]
    return <Chart type="area" series={series} options={opts} height={180} />
  }

  return (
    <div className="tc-card p-4 space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map(t => {
          const isActive   = t.key === safeActive
          const isCardio   = t.key === 'fc_repos' || t.key === 'fc_effort'
          const isMetric   = t.key === 'poids' || t.key === 'imc' || t.key === 'mensurations' || t.key === 'masse_grasse'
          const cardioMode = t.key === 'fc_effort' ? 'effort' : 'repos'

          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all"
              style={isActive
                ? { background: `${t.color}22`, border: `1px solid ${t.color}55`, color: t.color }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6A6A9A' }
              }
            >
              {isActive && isCardio && <HeartBeat mode={cardioMode} size={13} />}
              {isActive && isMetric  && (
                <MetricIcon
                  type={t.key as 'poids' | 'imc' | 'mensurations' | 'masse_grasse'}
                  size={14}
                />
              )}
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Bannière animée — Cardio */}
      {(safeActive === 'fc_repos' || safeActive === 'fc_effort') && (
        <div
          className="rounded-2xl px-4 py-3 space-y-2"
          style={{ background: 'rgba(255,59,92,0.07)', border: '1px solid rgba(255,59,92,0.18)' }}
        >
          <div className="flex items-center gap-3">
            <HeartBeat
              mode={safeActive === 'fc_effort' ? 'effort' : 'repos'}
              size={safeActive === 'fc_effort' ? 28 : 24}
              ecg={safeActive === 'fc_effort'}
            />
            <div>
              <p className="text-sm font-black" style={{ color: '#FF3B5C' }}>
                {safeActive === 'fc_repos' ? 'Fréquence cardiaque au repos' : "Fréquence cardiaque à l'effort"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#7A4050' }}>
                {safeActive === 'fc_repos'
                  ? 'Mesure au réveil à jeun — indicateur de forme globale'
                  : "Pic atteint lors de l'effort — cardio-training"}
              </p>
            </div>
          </div>
          <MetricNorms type={safeActive} sexe={clientSexe} age={clientAge} />
        </div>
      )}

      {/* Bannière animée — autres métriques */}
      {(safeActive === 'poids' || safeActive === 'imc' || safeActive === 'mensurations' || safeActive === 'masse_grasse') && (() => {
        const meta = METRIC_META[safeActive as keyof typeof METRIC_META]
        return (
          <div
            className="rounded-2xl px-4 py-3 space-y-2"
            style={{
              background: `${meta.color}0D`,
              border:     `1px solid ${meta.color}2A`,
            }}
          >
            <div className="flex items-center gap-3">
              <MetricIcon
                type={safeActive as 'poids' | 'imc' | 'mensurations' | 'masse_grasse'}
                size={32}
              />
              <div>
                <p className="text-sm font-black" style={{ color: meta.color }}>
                  {meta.title}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: `${meta.color}70` }}>
                  {meta.desc}
                </p>
              </div>
            </div>
            <MetricNorms
              type={safeActive as 'poids' | 'imc' | 'mensurations' | 'masse_grasse'}
              sexe={clientSexe}
              age={clientAge}
            />
          </div>
        )
      })()}

      {/* Chart */}
      {renderChart(safeActive)}
    </div>
  )
}
