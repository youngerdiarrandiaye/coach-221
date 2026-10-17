'use client'

import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

export const C = {
  green:   '#00FF85',
  blue:    '#00CFFF',
  purple:  '#7B6FFF',
  red:     '#FF3B5C',
  muted:   '#6A6A9A',
  dim:     '#9090B8',
  surface: '#0D0D20',
  bg:      '#05050F',
} as const

export const baseChart: ApexOptions['chart'] = {
  background:  'transparent',
  toolbar:     { show: false },
  zoom:        { enabled: false },
  fontFamily:  'inherit',
  animations:  { enabled: true, speed: 500 },
}

export const baseGrid: ApexOptions['grid'] = {
  borderColor:     'rgba(255,255,255,0.05)',
  strokeDashArray: 3,
  yaxis:           { lines: { show: true } },
  xaxis:           { lines: { show: false } },
  padding:         { left: 0, right: 4, top: 0, bottom: 0 },
}

type ChartType = 'bar' | 'area' | 'donut' | 'line'

interface ChartProps {
  type:     ChartType
  series:   ApexOptions['series']
  options:  ApexOptions
  height?:  number | string
  width?:   number | string
}

export function Chart({ type, series, options, height = 200, width = '100%' }: ChartProps) {
  return (
    <ReactApexChart
      type={type}
      series={series}
      options={options}
      height={height}
      width={width}
    />
  )
}
