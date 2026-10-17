'use client'

import type { ApexOptions } from 'apexcharts'
import { Chart, C, baseChart, baseGrid } from '@/components/ui/Chart'
import type { MonthlyRevenue } from './statsService'

interface Props {
  data: MonthlyRevenue[]
}

function formatCFA(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

export function RevenueChart({ data }: Props) {
  const currentMonth = data[data.length - 1]?.shortMonth
  const colors = data.map(d =>
    d.shortMonth === currentMonth ? C.green : 'rgba(0,255,133,0.22)',
  )

  const options: ApexOptions = {
    chart:  { ...baseChart, id: 'revenue-chart' },
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
      categories: data.map(d => d.shortMonth),
      axisBorder: { show: false },
      axisTicks:  { show: false },
      labels: {
        style: { colors: '#6A6A9A', fontSize: '11px', fontWeight: '600' },
      },
    },
    yaxis: {
      labels: {
        style:     { colors: '#6A6A9A', fontSize: '10px' },
        formatter: formatCFA,
      },
    },
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custom: ({ series, seriesIndex, dataIndex }: any) => {
        const entry = data[dataIndex]
        const value: number = series[seriesIndex][dataIndex]
        return `<div style="background:rgba(15,15,35,0.98);border:1px solid rgba(0,255,133,0.22);border-radius:12px;padding:12px 16px;box-shadow:0 16px 40px rgba(0,0,0,.60)"><p style="color:#9090B8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px">${entry?.shortMonth ?? ''}</p><p style="color:#fff;font-size:16px;font-weight:900;margin:0">${value.toLocaleString('fr-FR')} <span style="color:${C.green};font-size:13px;font-weight:600">FCFA</span></p><p style="color:#6A6A9A;font-size:11px;margin:4px 0 0">${entry?.count ?? 0} paiement${(entry?.count ?? 0) > 1 ? 's' : ''}</p></div>`
      },
    },
  }

  const series: ApexOptions['series'] = [{ name: 'Revenus', data: data.map(d => d.revenue) }]

  return <Chart type="bar" series={series} options={options} height={220} />
}
