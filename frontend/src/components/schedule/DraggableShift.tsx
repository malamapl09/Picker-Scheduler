'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Employee } from '@/types'

interface ShiftData {
  id: number
  schedule_id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  duration_hours: number
  total_hours: number
  employee?: Employee
}

interface DraggableShiftProps {
  shift: ShiftData
  isDraft: boolean
  onDelete: (id: number) => void
  onClick: () => void
}

function formatTime(time: string): string {
  const [hours] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 || 12
  return `${displayHour}${ampm}`
}

export function DraggableShift({ shift, isDraft, onDelete, onClick }: DraggableShiftProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: {
      type: 'shift',
      shift,
    },
    disabled: !isDraft,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDraft ? 'grab' : 'pointer',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging) {
          onClick()
        }
      }}
      className={`p-2 bg-blue-50 border border-blue-200 rounded-lg transition-all group
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400 z-50' : 'hover:bg-blue-100'}
        ${isDraft ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {isDraft && (
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            )}
            <p className="font-medium text-sm text-gray-900 truncate">
              {shift.employee?.first_name} {shift.employee?.last_name?.[0]}.
            </p>
          </div>
          <p className="text-xs text-gray-600">
            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
          </p>
        </div>
        {isDraft && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(shift.id)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-100 rounded transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
