'use client'

import { useMemo } from 'react'
import type { ApexOptions } from 'apexcharts'
import { Chart, C, baseChart, baseGrid } from '@/components/ui/Chart'
import type { WeeklyDay } from '@/services/dashboardService'

interface Props {
  data: WeeklyDay[]
}

export function WeeklyChart({ data }: Props) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const colors = data.map(d => (d.date === today ? C.green : '#1E1E3A'))

  const options: ApexOptions = {
    chart:  { ...baseChart, id: 'weekly-chart' },
    grid:   baseGrid,
    colors,
    plotOptions: {
      bar: {
        distributed:  true,
        borderRadius: 6,
        columnWidth:  '55%',
      },
    },
    dataLabels: { enabled: false },
    legend:     { show: false },
    xaxis: {
      categories: data.map(d => d.label),
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels:     { style: { colors: '#9090B8', fontSize: '12px' } },
    },
    yaxis: {
      labels: {
        style:     { colors: '#9090B8', fontSize: '12px' },
        formatter: (v: number) => String(Math.floor(v)),
      },
      min:            0,
      forceNiceScale: true,
    },
    tooltip: {
      theme: 'dark',
      style: { fontSize: '13px' },
      y:     { formatter: (v: number) => `${v} séance${v > 1 ? 's' : ''}` },
    },
  }

  const series: ApexOptions['series'] = [{ name: 'Séances', data: data.map(d => d.count) }]

  return (
    <div className="tc-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">Séances cette semaine</h2>
      <Chart type="bar" series={series} options={options} height={160} />
    </div>
  )
}
