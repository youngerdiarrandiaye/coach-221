'use client'

import type { ApexOptions } from 'apexcharts'
import { Chart } from '@/components/ui/Chart'

interface Props {
  effectuees: number
  planifiees: number
  annulees:  number
}

const ALL_LABELS = ['Effectuées', 'Planifiées', 'Annulées']
const ALL_COLORS = ['#00FF85', '#00CFFF', '#FF3B5C']

export function SessionsDonut({ effectuees, planifiees, annulees }: Props) {
  const rawData = [effectuees, planifiees, annulees]
  const total   = rawData.reduce((s, v) => s + v, 0)

  if (total === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Aucune séance</p>
      </div>
    )
  }

  const filtered = rawData
    .map((v, i) => ({ v, label: ALL_LABELS[i], color: ALL_COLORS[i] }))
    .filter(d => d.v > 0)

  const series = filtered.map(d => d.v)
  const labels = filtered.map(d => d.label)
  const colors = filtered.map(d => d.color)

  const options: ApexOptions = {
    chart: {
      background: 'transparent',
      toolbar:    { show: false },
      fontFamily: 'inherit',
      animations: { enabled: true, speed: 500 },
    },
    labels,
    colors,
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '68%',
          labels: {
            show:  true,
            name:  {
              fontSize:   '10px',
              fontWeight: '700',
              color:      '#6A6A9A',
              offsetY:    18,
            },
            value: {
              fontSize:   '24px',
              fontWeight: '900',
              color:      '#FFFFFF',
              offsetY:    -4,
              formatter:  (v: string) => v,
            },
            total: {
              show:       true,
              showAlways: true,
              label:      'total',
              fontSize:   '10px',
              fontWeight: '700',
              color:      '#6A6A9A',
              formatter:  () => String(total),
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    legend:     { show: false },
    stroke:     { width: 0 },
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custom: ({ seriesIndex }: any) => {
        const { color, label, v } = filtered[seriesIndex]
        return `<div style="background:rgba(15,15,35,0.98);border:1px solid ${color}33;border-radius:10px;padding:10px 12px;box-shadow:0 16px 40px rgba(0,0,0,.60)"><p style="color:${color};font-size:12px;font-weight:700;margin:0 0 2px">${label}</p><p style="color:#fff;font-size:18px;font-weight:900;margin:0">${v}</p></div>`
      },
    },
  }

  return (
    <div className="flex flex-col items-center">
      <Chart type="donut" series={series} options={options} height={180} width={180} />

      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {filtered.map(({ label, v, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[11px] text-muted-foreground">
              {label} <span className="font-bold text-white">{v}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
