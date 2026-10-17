'use client'

import type { ApexOptions } from 'apexcharts'
import { Chart, C, baseChart, baseGrid } from '@/components/ui/Chart'
import type { ProgressEntryRow } from '@/entities'

interface Props {
  entries:       ProgressEntryRow[]
  poidsInitial?: number | null
}

export function ProgressChart({ entries, poidsInitial }: Props) {
  const data = entries
    .filter(e => e.poids_kg !== null)
    .map(e => ({
      date:  new Date(e.mesure_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      poids: e.poids_kg as number,
    }))

  if (data.length === 0) return null

  const weights = data.map(d => d.poids)
  const min = Math.floor(Math.min(...weights) - 2)
  const max = Math.ceil(Math.max(...weights) + 2)

  const annotations: ApexOptions['annotations'] = poidsInitial
    ? {
        yaxis: [{
          y:               poidsInitial,
          borderColor:     '#9090B8',
          strokeDashArray: 4,
          label: {
            text:  'Initial',
            style: { color: '#9090B8', background: 'transparent', fontSize: '10px' },
          },
        }],
      }
    : {}

  const options: ApexOptions = {
    chart:  { ...baseChart, id: 'progress-chart' },
    grid:   baseGrid,
    colors: [C.green],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type:     'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom:    0.28,
        opacityTo:      0.02,
        stops:          [0, 100],
      },
    },
    markers: {
      size:         4,
      colors:       [C.green],
      strokeColors: '#05050F',
      strokeWidth:  2,
      hover:        { size: 6 },
    },
    xaxis: {
      categories: data.map(d => d.date),
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels:     { style: { colors: '#9090B8', fontSize: '11px' }, rotate: 0 },
      tickAmount: data.length > 6 ? 5 : undefined,
    },
    yaxis: {
      min,
      max,
      labels: {
        style:     { colors: '#9090B8', fontSize: '11px' },
        formatter: (v: number) => `${v}kg`,
      },
    },
    annotations,
    tooltip: {
      theme: 'dark',
      y:     { formatter: (v: number) => `${v} kg` },
    },
    dataLabels: { enabled: false },
  }

  const series: ApexOptions['series'] = [{ name: 'Poids', data: data.map(d => d.poids) }]

  return (
    <div className="tc-card p-4">
      <h2 className="mb-3 text-sm font-black text-white">Évolution du poids</h2>
      <Chart type="area" series={series} options={options} height={180} />
    </div>
  )
}
