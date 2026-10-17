'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ApexOptions } from 'apexcharts'
import { TrendingUp, TrendingDown, Minus, Target, Pencil, Check } from 'lucide-react'
import { Chart, C, baseChart, baseGrid } from '@/components/ui/Chart'
import type { DailyRevenue } from '@/services/dashboardService'

interface Props {
  revenue30Days:     DailyRevenue[]
  totalRevenue30:    number
  totalRevenuePrev30: number
  revenueCeMois:     number
}

const GOAL_KEY = 'tc_objectif_ca_mensuel'

function formatCFA(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k`
  return String(v)
}

export function RevenueWidget({
  revenue30Days, totalRevenue30, totalRevenuePrev30, revenueCeMois,
}: Props) {
  const [goal, setGoal]         = useState<number>(0)
  const [editing, setEditing]   = useState(false)
  const [goalInput, setGoalInput] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(GOAL_KEY)
    if (saved) {
      const n = parseInt(saved, 10)
      if (!isNaN(n) && n > 0) { setGoal(n); setGoalInput(String(n)) }
    }
  }, [])

  const saveGoal = useCallback(() => {
    const n = parseInt(goalInput.replace(/\s/g, ''), 10)
    if (!isNaN(n) && n > 0) {
      setGoal(n)
      localStorage.setItem(GOAL_KEY, String(n))
    }
    setEditing(false)
  }, [goalInput])

  // ── Comparison badge ───────────────────────────────────────
  const diffPct = totalRevenuePrev30 > 0
    ? Math.round(((totalRevenue30 - totalRevenuePrev30) / totalRevenuePrev30) * 100)
    : totalRevenue30 > 0 ? 100 : 0

  const isUp   = diffPct > 0
  const isFlat = diffPct === 0 && totalRevenuePrev30 === 0

  // ── Chart options ──────────────────────────────────────────
  const categories = revenue30Days.map(d => {
    const [, m, day] = d.date.split('-')
    return `${day}/${m}`
  })

  const options: ApexOptions = {
    chart:  { ...baseChart, id: 'revenue-30' },
    grid:   { ...baseGrid, padding: { left: 0, right: 4, top: 0, bottom: -10 } },
    colors: [C.green],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type:     'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.22, opacityTo: 0.01, stops: [0, 100] },
    },
    markers: { size: 0, hover: { size: 4, sizeOffset: 2 } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels: {
        style:      { colors: '#6A6A9A', fontSize: '10px' },
        rotate:     0,
        hideOverlappingLabels: true,
      },
      tickAmount: 6,
    },
    yaxis: {
      labels: {
        style:     { colors: '#6A6A9A', fontSize: '10px' },
        formatter: formatCFA,
      },
    },
    tooltip: {
      theme: 'dark',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      x: { formatter: (_: number, opts: any) =>
        revenue30Days[opts?.dataPointIndex]?.date ?? '' },
      y: { formatter: (v: number) => `${v.toLocaleString('fr-FR')} FCFA` },
    },
    dataLabels: { enabled: false },
  }

  const series: ApexOptions['series'] = [{ name: 'Revenus', data: revenue30Days.map(d => d.amount) }]

  // ── Objectif mensuel gauge ─────────────────────────────────
  const goalPct    = goal > 0 ? Math.min(100, Math.round((revenueCeMois / goal) * 100)) : 0
  const goalColor  = goalPct >= 80 ? C.green : goalPct >= 50 ? '#FFD600' : '#FF3B5C'

  return (
    <div className="tc-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6A6A9A' }}>
            Revenus — 30 derniers jours
          </p>
          <p className="text-xl font-black text-white mt-0.5 tabular-nums">
            {totalRevenue30.toLocaleString('fr-FR')}
            <span className="text-sm font-semibold ml-1" style={{ color: C.green }}>FCFA</span>
          </p>
        </div>

        {/* Comparison badge */}
        {!isFlat && (
          <div
            className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-black shrink-0"
            style={isUp
              ? { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: C.green }
              : { background: 'rgba(255,59,92,0.12)',  border: '1px solid rgba(255,59,92,0.28)',  color: '#FF3B5C' }
            }
          >
            {isUp
              ? <TrendingUp  size={11} />
              : diffPct === 0 ? <Minus size={11} /> : <TrendingDown size={11} />}
            {isUp ? '+' : ''}{diffPct}%
            <span className="font-normal ml-0.5 opacity-70">vs 30j préc.</span>
          </div>
        )}
      </div>

      {/* Area chart */}
      <div className="-mx-1">
        <Chart type="area" series={series} options={options} height={120} />
      </div>

      {/* Objectif mensuel CA */}
      <div
        className="rounded-2xl p-3.5 space-y-2.5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Target size={13} style={{ color: C.purple }} />
            <span className="text-xs font-bold text-white">Objectif mensuel</span>
          </div>

          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveGoal() }}
                placeholder="Ex: 500000"
                autoFocus
                className="w-28 rounded-xl bg-card border border-border text-white text-xs px-2 py-1
                           focus:outline-none focus:border-primary placeholder:text-muted-foreground"
              />
              <button
                onClick={saveGoal}
                className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                style={{ color: C.green }}
              >
                <Check size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs transition-colors hover:text-white"
              style={{ color: '#6A6A9A' }}
            >
              {goal > 0 ? `${goal.toLocaleString('fr-FR')} FCFA` : 'Définir'}
              <Pencil size={10} />
            </button>
          )}
        </div>

        {goal > 0 && (
          <>
            {/* Progress bar */}
            <div
              className="h-2 w-full rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width:      `${goalPct}%`,
                  background: `linear-gradient(90deg, ${goalColor} 0%, ${goalColor}88 100%)`,
                  boxShadow:  `0 0 8px ${goalColor}44`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: goalColor }} className="font-black">{goalPct}%</span>
              <span style={{ color: '#6A6A9A' }}>
                {revenueCeMois.toLocaleString('fr-FR')} / {goal.toLocaleString('fr-FR')} FCFA ce mois
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
