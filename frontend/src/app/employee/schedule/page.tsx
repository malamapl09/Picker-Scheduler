'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { shifts as shiftsApi, employees as employeesApi, stores as storesApi } from '@/lib/api'
import { Shift, Employee, Store } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [currentWeek, setCurrentWeek] = useState(formatDate(getMonday(new Date())))
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week')

  useEffect(() => {
    if (!user) return

    const loadEmployee = async () => {
      const employees = await employeesApi.list()
      const currentEmployee = employees.find((e: Employee) => e.user_id === user.id)
      if (currentEmployee) {
        setEmployee(currentEmployee)
        const storeData = await storesApi.get(currentEmployee.store_id)
        setStore(storeData)
      }
    }

    loadEmployee()
  }, [user])

  useEffect(() => {
    if (!employee) return

    const loadShifts = async () => {
      setLoading(true)
      try {
        const allShifts = await shiftsApi.list(undefined, employee.id)
        setShifts(allShifts)
      } catch (error) {
        console.error('Error loading shifts:', error)
      }
      setLoading(false)
    }

    loadShifts()
  }, [employee])

  const changeWeek = (direction: number) => {
    const current = new Date(currentWeek)
    current.setDate(current.getDate() + (direction * 7))
    setCurrentWeek(formatDate(current))
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + i)
    return d
  })

  const getShiftForDay = (date: Date): Shift | undefined => {
    const dateStr = formatDate(date)
    return shifts.find(s => s.date === dateStr)
  }

  const weekShifts = weekDates.map(date => ({
    date,
    shift: getShiftForDay(date),
  }))

  const totalHoursThisWeek = weekShifts.reduce((sum, { shift }) => {
    return sum + (shift?.total_hours || shift?.duration_hours || 0)
  }, 0)

  const upcomingShifts = shifts
    .filter(s => new Date(s.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (loading && !employee) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
          <p className="text-gray-500">{store?.name || 'Loading...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm font-medium rounded ${
                viewMode === 'week' ? 'bg-white shadow' : 'text-gray-600'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-sm font-medium rounded ${
                viewMode === 'list' ? 'bg-white shadow' : 'text-gray-600'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => changeWeek(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <h2 className="font-semibold text-gray-900">
              Week of {new Date(currentWeek).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <p className="text-sm text-gray-500">
              {totalHoursThisWeek.toFixed(1)} hours scheduled
            </p>
          </div>
          <button
            onClick={() => changeWeek(1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {viewMode === 'week' ? (
        /* Week View */
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="grid grid-cols-7 border-b">
            {weekDates.map((date, i) => {
              const isToday = date.toDateString() === new Date().toDateString()
              return (
                <div
                  key={i}
                  className={`p-3 text-center border-r last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <p className="text-xs text-gray-500">{DAY_NAMES[i]}</p>
                  <p className={`text-lg font-semibold ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-7 min-h-[200px]">
            {weekShifts.map(({ date, shift }, i) => {
              const isToday = date.toDateString() === new Date().toDateString()
              return (
                <div
                  key={i}
                  className={`p-2 border-r last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}
                >
                  {shift ? (
                    <div className="bg-blue-100 border border-blue-200 rounded-lg p-2 h-full">
                      <p className="text-sm font-semibold text-blue-900">
                        {shift.start_time.slice(0, 5)}
                      </p>
                      <p className="text-sm font-semibold text-blue-900">
                        {shift.end_time.slice(0, 5)}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {shift.total_hours?.toFixed(1) || shift.duration_hours?.toFixed(1)}h
                      </p>
                      {shift.break_minutes > 0 && (
                        <p className="text-xs text-blue-600">
                          {shift.break_minutes}m break
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <span className="text-xs text-gray-400">Off</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Upcoming Shifts</h2>
          </div>
          {upcomingShifts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No upcoming shifts</p>
            </div>
          ) : (
            <div className="divide-y">
              {upcomingShifts.map((shift) => {
                const shiftDate = new Date(shift.date)
                const isToday = shiftDate.toDateString() === new Date().toDateString()

                return (
                  <div key={shift.id} className={`p-4 flex items-center justify-between ${isToday ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center ${
                        isToday ? 'bg-blue-600 text-white' : 'bg-gray-100'
                      }`}>
                        <span className="text-xs font-medium">
                          {shiftDate.toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                        <span className="text-lg font-bold">{shiftDate.getDate()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {shiftDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-gray-500">
                          {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {shift.total_hours?.toFixed(1) || shift.duration_hours?.toFixed(1)}h
                      </p>
                      {shift.break_minutes > 0 && (
                        <p className="text-xs text-gray-500">{shift.break_minutes}min break</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Hours Summary Card */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Hours Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{totalHoursThisWeek.toFixed(1)}</p>
            <p className="text-sm text-gray-500">This Week</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-600">44</p>
            <p className="text-sm text-gray-500">Max Weekly</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {Math.max(0, 44 - totalHoursThisWeek).toFixed(1)}
            </p>
            <p className="text-sm text-gray-500">Available</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{weekShifts.filter(w => w.shift).length}</p>
            <p className="text-sm text-gray-500">Days Working</p>
          </div>
        </div>
      </div>
    </div>
  )
}
