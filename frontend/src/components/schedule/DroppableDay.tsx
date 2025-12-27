'use client'

import { useDroppable } from '@dnd-kit/core'
import { ReactNode } from 'react'
import { CoverageIndicator, MiniCoverageBars } from './CoverageIndicator'

interface HourlyCoverage {
  required: number
  scheduled: number
  delta: number
  status: 'adequate' | 'understaffed' | 'overstaffed'
}

interface DroppableDayProps {
  date: Date
  dateStr: string
  isDraft: boolean
  children: ReactNode
  onAddShift: () => void
  coverageData?: Record<string, HourlyCoverage> | null
  showCoverage?: boolean
}

export function DroppableDay({
  date,
  dateStr,
  isDraft,
  children,
  onAddShift,
  coverageData,
  showCoverage = true,
}: DroppableDayProps) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: `day-${dateStr}`,
    data: {
      type: 'day',
      date: dateStr,
    },
    disabled: !isDraft,
  })

  const isValidDrop = active?.data?.current?.type === 'shift'

  // Calculate day coverage summary for background color
  let dayStatus: 'adequate' | 'understaffed' | 'overstaffed' | null = null
  if (coverageData) {
    const hours = Object.values(coverageData)
    const understaffedCount = hours.filter(h => h.status === 'understaffed').length
    const overstaffedCount = hours.filter(h => h.status === 'overstaffed').length

    if (understaffedCount > hours.length * 0.3) {
      dayStatus = 'understaffed'
    } else if (overstaffedCount > hours.length * 0.3) {
      dayStatus = 'overstaffed'
    } else if (understaffedCount === 0 && overstaffedCount === 0) {
      dayStatus = 'adequate'
    }
  }

  const bgColors = {
    adequate: 'bg-green-50/50',
    understaffed: 'bg-amber-50/50',
    overstaffed: 'bg-blue-50/50',
  }

  return (
    <div
      ref={setNodeRef}
      className={`border-r last:border-r-0 p-2 min-h-[120px] transition-colors
        ${isOver && isValidDrop ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''}
        ${!isOver && dayStatus && showCoverage ? bgColors[dayStatus] : ''}
        ${isDraft && !isOver ? 'hover:bg-gray-50/50' : ''}
      `}
    >
      {/* Coverage Indicator */}
      {showCoverage && coverageData && (
        <CoverageIndicator dateStr={dateStr} hourlyData={coverageData} />
      )}

      {/* Shifts */}
      <div className="space-y-2">
        {children}
      </div>

      {/* Add Shift Button */}
      {isDraft && (
        <button
          onClick={onAddShift}
          className={`w-full mt-2 p-2 border-2 border-dashed rounded-lg text-sm transition-colors
            ${isOver && isValidDrop
              ? 'border-blue-400 text-blue-600 bg-blue-100'
              : 'border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600'
            }
          `}
        >
          {isOver && isValidDrop ? 'Drop here' : '+ Add Shift'}
        </button>
      )}
    </div>
  )
}
