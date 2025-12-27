'use client'

import { useState } from 'react'

interface HourlyCoverage {
  required: number
  scheduled: number
  delta: number
  status: 'adequate' | 'understaffed' | 'overstaffed'
}

interface CoverageIndicatorProps {
  dateStr: string
  hourlyData: Record<string, HourlyCoverage> | null
  showExpanded?: boolean
}

export function CoverageIndicator({ dateStr, hourlyData, showExpanded = false }: CoverageIndicatorProps) {
  const [expanded, setExpanded] = useState(false)

  if (!hourlyData) {
    return null
  }

  const hours = Object.entries(hourlyData).sort(([a], [b]) => parseInt(a) - parseInt(b))

  // Calculate day summary
  const totalRequired = hours.reduce((sum, [, data]) => sum + data.required, 0)
  const totalScheduled = hours.reduce((sum, [, data]) => sum + data.scheduled, 0)
  const coveragePercent = totalRequired > 0 ? Math.round((totalScheduled / totalRequired) * 100) : 100
  const understaffedCount = hours.filter(([, data]) => data.status === 'understaffed').length
  const overstaffedCount = hours.filter(([, data]) => data.status === 'overstaffed').length

  // Determine overall status
  let overallStatus: 'adequate' | 'understaffed' | 'overstaffed' = 'adequate'
  if (understaffedCount > overstaffedCount && understaffedCount > 0) {
    overallStatus = 'understaffed'
  } else if (overstaffedCount > understaffedCount && overstaffedCount > 0) {
    overallStatus = 'overstaffed'
  }

  const statusColors = {
    adequate: 'bg-green-100 text-green-700 border-green-200',
    understaffed: 'bg-amber-100 text-amber-700 border-amber-200',
    overstaffed: 'bg-blue-100 text-blue-700 border-blue-200',
  }

  const statusBarColors = {
    adequate: 'bg-green-500',
    understaffed: 'bg-amber-500',
    overstaffed: 'bg-blue-500',
  }

  const formatHour = (hour: string) => {
    const h = parseInt(hour)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayHour = h % 12 || 12
    return `${displayHour}${ampm}`
  }

  return (
    <div className="mb-2">
      {/* Summary Bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-2 py-1 rounded border text-xs font-medium flex items-center justify-between transition-colors ${statusColors[overallStatus]} hover:opacity-80`}
      >
        <span className="flex items-center gap-1">
          {overallStatus === 'understaffed' && (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {coveragePercent}%
        </span>
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Hourly Breakdown */}
      {expanded && (
        <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-xs">
          <div className="grid gap-1">
            {hours.map(([hour, data]) => (
              <div key={hour} className="flex items-center gap-2">
                <span className="w-10 text-gray-500">{formatHour(hour)}</span>
                <div className="flex-1 h-4 bg-gray-200 rounded-sm overflow-hidden relative">
                  {/* Required bar (background) */}
                  <div className="absolute inset-y-0 left-0 bg-gray-300" style={{ width: '100%' }} />
                  {/* Scheduled bar */}
                  <div
                    className={`absolute inset-y-0 left-0 ${statusBarColors[data.status]} transition-all`}
                    style={{ width: `${Math.min((data.scheduled / Math.max(data.required, 1)) * 100, 100)}%` }}
                  />
                  {/* Required marker line */}
                  {data.required > 0 && (
                    <div className="absolute inset-y-0 w-0.5 bg-gray-600" style={{ left: '100%', transform: 'translateX(-100%)' }} />
                  )}
                </div>
                <span className={`w-8 text-right ${
                  data.status === 'understaffed' ? 'text-amber-600' :
                  data.status === 'overstaffed' ? 'text-blue-600' : 'text-green-600'
                }`}>
                  {data.scheduled}/{data.required}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-gray-500">
            <span>Total: {totalScheduled.toFixed(1)}/{totalRequired.toFixed(1)} hrs</span>
            <span>{understaffedCount > 0 && `${understaffedCount} gaps`}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Mini coverage bars for compact display
export function MiniCoverageBars({ hourlyData }: { hourlyData: Record<string, HourlyCoverage> | null }) {
  if (!hourlyData) return null

  const hours = Object.entries(hourlyData).sort(([a], [b]) => parseInt(a) - parseInt(b))

  const statusColors = {
    adequate: 'bg-green-400',
    understaffed: 'bg-amber-400',
    overstaffed: 'bg-blue-400',
  }

  return (
    <div className="flex gap-px h-2 mb-1 rounded overflow-hidden">
      {hours.map(([hour, data]) => (
        <div
          key={hour}
          className={`flex-1 ${statusColors[data.status]}`}
          title={`${parseInt(hour) % 12 || 12}${parseInt(hour) >= 12 ? 'PM' : 'AM'}: ${data.scheduled}/${data.required} (${data.status})`}
        />
      ))}
    </div>
  )
}
