'use client'

import { DragOverlay } from '@dnd-kit/core'
import { Employee } from '@/types'

interface ShiftData {
  id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  employee?: Employee
}

interface ShiftDragOverlayProps {
  activeShift: ShiftData | null
}

function formatTime(time: string): string {
  const [hours] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 || 12
  return `${displayHour}${ampm}`
}

export function ShiftDragOverlay({ activeShift }: ShiftDragOverlayProps) {
  if (!activeShift) return null

  return (
    <DragOverlay dropAnimation={null}>
      <div className="p-2 bg-blue-100 border-2 border-blue-400 rounded-lg shadow-xl cursor-grabbing w-[140px]">
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <p className="font-medium text-sm text-gray-900 truncate">
            {activeShift.employee?.first_name} {activeShift.employee?.last_name?.[0]}.
          </p>
        </div>
        <p className="text-xs text-gray-600">
          {formatTime(activeShift.start_time)} - {formatTime(activeShift.end_time)}
        </p>
      </div>
    </DragOverlay>
  )
}
