'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { stores as storesApi, schedules as schedulesApi, shifts as shiftsApi, employees as employeesApi, reports, optimizer } from '@/lib/api'
import { Store, Schedule, Shift, Employee } from '@/types'
import { DraggableShift } from '@/components/schedule/DraggableShift'
import { DroppableDay } from '@/components/schedule/DroppableDay'
import { ShiftDragOverlay } from '@/components/schedule/ShiftDragOverlay'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatTime(time: string): string {
  const [hours] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 || 12
  return `${displayHour}${ampm}`
}

interface ShiftWithEmployee extends Shift {
  employee?: Employee
}

export default function SchedulesPage() {
  const searchParams = useSearchParams()
  const weekParam = searchParams.get('week')
  const storeParam = searchParams.get('store')

  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(storeParam ? parseInt(storeParam) : null)
  const [currentWeek, setCurrentWeek] = useState(weekParam || formatDate(getMonday(new Date())))
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [shifts, setShifts] = useState<ShiftWithEmployee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [coverage, setCoverage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [selectedShift, setSelectedShift] = useState<ShiftWithEmployee | null>(null)
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addShiftDate, setAddShiftDate] = useState<string | null>(null)
  const [showMoveConfirm, setShowMoveConfirm] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ shiftId: number; newDate: string; shift: ShiftWithEmployee } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCoverage, setShowCoverage] = useState(true)

  // Drag and drop state
  const [activeShift, setActiveShift] = useState<ShiftWithEmployee | null>(null)

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    })
  )

  // Load stores
  useEffect(() => {
    storesApi.list().then(data => {
      setStores(data)
      if (data.length > 0 && !selectedStore) {
        setSelectedStore(data[0].id)
      }
    })
  }, [])

  // Load schedule data
  const loadData = useCallback(async () => {
    if (!selectedStore) return

    setLoading(true)
    try {
      const [scheduleList, employeeList, coverageData] = await Promise.all([
        schedulesApi.list(selectedStore),
        employeesApi.list(selectedStore),
        reports.coverage(selectedStore, currentWeek).catch(() => null),
      ])

      setEmployees(employeeList)
      setCoverage(coverageData)

      const currentSchedule = scheduleList.find((s: Schedule) => s.week_start_date === currentWeek)
      setSchedule(currentSchedule || null)

      if (currentSchedule) {
        const shiftList = await shiftsApi.list(currentSchedule.id)
        const shiftsWithEmployees = shiftList.map((shift: Shift) => ({
          ...shift,
          employee: employeeList.find((e: Employee) => e.id === shift.employee_id),
        }))
        setShifts(shiftsWithEmployees)
      } else {
        setShifts([])
      }
    } catch (error) {
      console.error('Error loading schedule data:', error)
    }
    setLoading(false)
  }, [selectedStore, currentWeek])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + i)
    return d
  })

  const getShiftsForDay = (date: Date) => {
    const dateStr = formatDate(date)
    return shifts.filter(s => s.date === dateStr)
  }

  const getCoverageForDay = (dateStr: string) => {
    if (!coverage?.hourly_breakdown) return null
    return coverage.hourly_breakdown[dateStr] || null
  }

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    if (active.data.current?.type === 'shift') {
      setActiveShift(active.data.current.shift)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveShift(null)

    if (!over) return

    const shiftData = active.data.current?.shift as ShiftWithEmployee
    const targetData = over.data.current

    if (!shiftData || targetData?.type !== 'day') return

    const newDate = targetData.date as string

    // If same day, do nothing
    if (shiftData.date === newDate) return

    // Show confirmation modal
    setPendingMove({
      shiftId: shiftData.id,
      newDate,
      shift: shiftData,
    })
    setShowMoveConfirm(true)
  }

  const handleConfirmMove = async () => {
    if (!pendingMove) return

    try {
      await shiftsApi.update(pendingMove.shiftId, { date: pendingMove.newDate })
      setMessage({ type: 'success', text: 'Shift moved successfully!' })
      await loadData()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'object' && detail.message) {
        setMessage({ type: 'error', text: detail.message })
      } else {
        setMessage({ type: 'error', text: 'Failed to move shift' })
      }
    }
    setShowMoveConfirm(false)
    setPendingMove(null)
  }

  const handleGenerateSchedule = async () => {
    if (!selectedStore) return

    setGenerating(true)
    try {
      const result = await optimizer.generate({
        store_id: selectedStore,
        week_start: currentWeek,
        apply_immediately: true,
        min_coverage_percent: 0.9,
      })

      if (result.schedule_id) {
        await loadData()
        setMessage({ type: 'success', text: `Schedule generated! ${result.stats.total_shifts} shifts created.` })
      } else if (result.status === 'infeasible') {
        setMessage({ type: 'error', text: 'Could not generate a feasible schedule. Try adding more employees or adjusting constraints.' })
      } else {
        setMessage({ type: 'error', text: result.message })
      }
    } catch (error) {
      console.error('Error generating schedule:', error)
      setMessage({ type: 'error', text: 'Failed to generate schedule' })
    }
    setGenerating(false)
    setShowOptimizeModal(false)
  }

  const handlePublish = async () => {
    if (!schedule) return

    setPublishing(true)
    try {
      await schedulesApi.publish(schedule.id)
      await loadData()
      setMessage({ type: 'success', text: 'Schedule published successfully!' })
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'object' && detail.message) {
        setMessage({ type: 'error', text: `Cannot publish: ${detail.message}` })
      } else {
        setMessage({ type: 'error', text: 'Failed to publish schedule' })
      }
    }
    setPublishing(false)
  }

  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm('Delete this shift?')) return

    try {
      await shiftsApi.delete(shiftId)
      await loadData()
      setMessage({ type: 'success', text: 'Shift deleted' })
    } catch (error) {
      console.error('Error deleting shift:', error)
      setMessage({ type: 'error', text: 'Failed to delete shift' })
    }
  }

  const handleAddShift = async (employeeId: number, startTime: string, endTime: string) => {
    if (!schedule || !addShiftDate) return

    try {
      await shiftsApi.create({
        schedule_id: schedule.id,
        employee_id: employeeId,
        date: addShiftDate,
        start_time: startTime,
        end_time: endTime,
      })
      await loadData()
      setShowAddModal(false)
      setAddShiftDate(null)
      setMessage({ type: 'success', text: 'Shift added successfully!' })
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'object' && detail.message) {
        setMessage({ type: 'error', text: detail.message })
      } else {
        setMessage({ type: 'error', text: 'Failed to add shift' })
      }
    }
  }

  const changeWeek = (direction: number) => {
    const current = new Date(currentWeek)
    current.setDate(current.getDate() + (direction * 7))
    setCurrentWeek(formatDate(current))
  }

  const isDraft = schedule?.status === 'draft'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
            <p className="text-gray-500">
              {isDraft ? 'Drag and drop shifts to reschedule' : 'Manage weekly shift schedules'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedStore || ''}
              onChange={(e) => setSelectedStore(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-white border rounded-lg">
              <button
                onClick={() => changeWeek(-1)}
                className="p-2 hover:bg-gray-100 rounded-l-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="px-3 py-2 text-sm font-medium">
                {new Date(currentWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <button
                onClick={() => changeWeek(1)}
                className="p-2 hover:bg-gray-100 rounded-r-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {!schedule && (
              <button
                onClick={() => setShowOptimizeModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Schedule
              </button>
            )}

            {schedule && isDraft && (
              <>
                <button
                  onClick={() => setShowOptimizeModal(true)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Regenerate
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {publishing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Publishing...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Publish
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`p-4 rounded-lg flex items-center justify-between ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="p-1 hover:bg-white/50 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Status Bar */}
        {schedule && (
          <div className={`p-4 rounded-lg flex items-center justify-between ${
            schedule.status === 'published' ? 'bg-green-50 border border-green-200' :
            'bg-yellow-50 border border-yellow-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                schedule.status === 'published' ? 'bg-green-100 text-green-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {schedule.status === 'published' ? 'Published' : 'Draft'}
              </span>
              <span className="text-sm text-gray-600">
                {shifts.length} shifts | {employees.length} employees
              </span>
              {isDraft && (
                <span className="text-sm text-blue-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                  Drag shifts to move
                </span>
              )}
            </div>
            {coverage && (
              <div className="flex items-center gap-4 text-sm">
                <button
                  onClick={() => setShowCoverage(!showCoverage)}
                  className={`px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors ${
                    showCoverage
                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showCoverage ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z" : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showCoverage ? "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" : ""} />
                  </svg>
                  Coverage
                </button>
                <span className={`font-medium ${
                  coverage.coverage_score >= 90 ? 'text-green-600' :
                  coverage.coverage_score >= 70 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {coverage.coverage_score?.toFixed(0)}%
                </span>
                <span className="text-gray-500">
                  {coverage.total_scheduled_hours?.toFixed(1)}h / {coverage.total_required_hours?.toFixed(1)}h
                </span>
              </div>
            )}
          </div>
        )}

        {/* Calendar Grid */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b bg-gray-50">
            {weekDates.map((date, i) => {
              const isToday = formatDate(date) === formatDate(new Date())
              return (
                <div key={i} className={`p-3 text-center border-r last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}>
                  <p className={`text-xs uppercase ${isToday ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <p className={`text-lg font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Shifts Grid */}
          <div className="grid grid-cols-7 min-h-[400px]">
            {weekDates.map((date, dayIndex) => {
              const dayShifts = getShiftsForDay(date)
              const dateStr = formatDate(date)

              return (
                <DroppableDay
                  key={dayIndex}
                  date={date}
                  dateStr={dateStr}
                  isDraft={isDraft}
                  onAddShift={() => {
                    setAddShiftDate(dateStr)
                    setShowAddModal(true)
                  }}
                  coverageData={getCoverageForDay(dateStr)}
                  showCoverage={showCoverage}
                >
                  {loading ? (
                    <div className="flex items-center justify-center h-20">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : dayShifts.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">
                      No shifts
                    </div>
                  ) : (
                    dayShifts.map((shift) => (
                      <DraggableShift
                        key={shift.id}
                        shift={shift}
                        isDraft={isDraft}
                        onDelete={handleDeleteShift}
                        onClick={() => setSelectedShift(shift)}
                      />
                    ))
                  )}
                </DroppableDay>
              )
            })}
          </div>
        </div>

        {/* Drag Overlay */}
        <ShiftDragOverlay activeShift={activeShift} />

        {/* Legend */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Coverage Legend */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Coverage</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
                  <span>Adequate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300"></div>
                  <span>Understaffed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300"></div>
                  <span>Overstaffed</span>
                </div>
              </div>
            </div>

            <div className="lg:border-l lg:pl-6">
              <h3 className="font-semibold text-gray-900 mb-2">Tips</h3>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                  <span>Drag to move</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <span>Click for details</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>Expand coverage for hourly breakdown</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Move Confirmation Modal */}
        {showMoveConfirm && pendingMove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Move Shift?</h2>
              <div className="space-y-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">
                    {pendingMove.shift.employee?.first_name} {pendingMove.shift.employee?.last_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatTime(pendingMove.shift.start_time)} - {formatTime(pendingMove.shift.end_time)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">From</p>
                    <p className="font-medium text-red-700">
                      {new Date(pendingMove.shift.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <div className="flex-1 text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">To</p>
                    <p className="font-medium text-green-700">
                      {new Date(pendingMove.newDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowMoveConfirm(false)
                    setPendingMove(null)
                  }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmMove}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Move Shift
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Optimize Modal */}
        {showOptimizeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Generate Optimized Schedule</h2>
              <p className="text-gray-600 mb-6">
                This will use AI to create an optimized schedule based on demand forecasts, employee availability, and compliance rules.
              </p>
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Target Coverage</span>
                  <span className="font-medium">90%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Max Hours/Week</span>
                  <span className="font-medium">44 hours</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Days On Pattern</span>
                  <span className="font-medium">6 on, 1 off</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowOptimizeModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateSchedule}
                  disabled={generating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Generating...
                    </>
                  ) : (
                    'Generate'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Shift Modal */}
        {showAddModal && addShiftDate && (
          <AddShiftModal
            date={addShiftDate}
            employees={employees}
            onClose={() => {
              setShowAddModal(false)
              setAddShiftDate(null)
            }}
            onAdd={handleAddShift}
          />
        )}

        {/* Shift Detail Modal */}
        {selectedShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Shift Details</h2>
                <button
                  onClick={() => setSelectedShift(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500">Employee</label>
                  <p className="font-medium">{selectedShift.employee?.first_name} {selectedShift.employee?.last_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Date</label>
                    <p className="font-medium">{new Date(selectedShift.date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Hours</label>
                    <p className="font-medium">{selectedShift.total_hours?.toFixed(1) || '-'}h</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Start Time</label>
                    <p className="font-medium">{formatTime(selectedShift.start_time)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">End Time</label>
                    <p className="font-medium">{formatTime(selectedShift.end_time)}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Break</label>
                  <p className="font-medium">{selectedShift.break_minutes} minutes</p>
                </div>
              </div>
              {isDraft && (
                <div className="mt-6 pt-4 border-t flex gap-3">
                  <button
                    onClick={() => {
                      handleDeleteShift(selectedShift.id)
                      setSelectedShift(null)
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  )
}

// Add Shift Modal Component
function AddShiftModal({
  date,
  employees,
  onClose,
  onAdd,
}: {
  date: string
  employees: Employee[]
  onClose: () => void
  onAdd: (employeeId: number, startTime: string, endTime: string) => Promise<void>
}) {
  const [employeeId, setEmployeeId] = useState<number>(employees[0]?.id || 0)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('16:00')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!employeeId) return
    setSubmitting(true)
    await onAdd(employeeId, startTime, endTime)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Add Shift</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">Date</p>
          <p className="font-medium">
            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !employeeId}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Shift'}
          </button>
        </div>
      </div>
    </div>
  )
}
