'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { shifts as shiftsApi, employees as employeesApi, timeOff as timeOffApi, swaps as swapsApi, compliance } from '@/lib/api'
import { Shift, Employee, TimeOffRequest, ShiftSwap } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function EmployeeDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [upcomingShifts, setUpcomingShifts] = useState<Shift[]>([])
  const [pendingTimeOff, setPendingTimeOff] = useState<TimeOffRequest[]>([])
  const [pendingSwaps, setPendingSwaps] = useState<ShiftSwap[]>([])
  const [hoursThisWeek, setHoursThisWeek] = useState(0)
  const [hoursNextWeek, setHoursNextWeek] = useState(0)

  const currentWeek = formatDate(getMonday(new Date()))
  const nextWeek = formatDate(getMonday(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))

  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      setLoading(true)
      try {
        // Get employee record for current user
        const employees = await employeesApi.list()
        const currentEmployee = employees.find((e: Employee) => e.user_id === user.id)

        if (currentEmployee) {
          setEmployee(currentEmployee)

          // Load all data in parallel
          const [shifts, timeOffRequests, swapRequests, complianceData, nextWeekCompliance] = await Promise.all([
            shiftsApi.list(undefined, currentEmployee.id).catch(() => []),
            timeOffApi.list(currentEmployee.id, 'pending').catch(() => []),
            swapsApi.list(currentEmployee.id, 'pending').catch(() => []),
            compliance.getEmployeeStatus(currentEmployee.id, currentWeek).catch(() => null),
            compliance.getEmployeeStatus(currentEmployee.id, nextWeek).catch(() => null),
          ])

          // Get upcoming shifts (next 7 days)
          const today = new Date()
          const upcoming = shifts.filter((s: Shift) => new Date(s.date) >= today)
            .sort((a: Shift, b: Shift) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 5)

          setUpcomingShifts(upcoming)
          setPendingTimeOff(timeOffRequests)
          setPendingSwaps(swapRequests)
          setHoursThisWeek(complianceData?.total_hours || 0)
          setHoursNextWeek(nextWeekCompliance?.total_hours || 0)
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      }
      setLoading(false)
    }

    loadData()
  }, [user, currentWeek, nextWeek])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold">
          Welcome back{employee ? `, ${employee.first_name}` : ''}!
        </h1>
        <p className="text-blue-100 mt-1">Here's your schedule overview</p>
      </div>

      {/* Hours Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">This Week</p>
          <p className={`text-3xl font-bold ${hoursThisWeek > 40 ? 'text-orange-600' : 'text-blue-600'}`}>
            {hoursThisWeek.toFixed(1)}h
          </p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${hoursThisWeek > 44 ? 'bg-red-500' : hoursThisWeek > 40 ? 'bg-orange-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min((hoursThisWeek / 44) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Next Week</p>
          <p className="text-3xl font-bold text-green-600">{hoursNextWeek.toFixed(1)}h</p>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${Math.min((hoursNextWeek / 44) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Weekly Max</p>
          <p className="text-3xl font-bold text-gray-600">44h</p>
          <p className="text-xs text-gray-400 mt-2">Maximum allowed hours</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-4 gap-4">
        <Link href="/employee/schedule" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">My Schedule</h2>
              <p className="text-sm text-gray-500">View shifts</p>
            </div>
          </div>
        </Link>

        <Link href="/employee/availability" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Availability</h2>
              <p className="text-sm text-gray-500">Set preferences</p>
            </div>
          </div>
        </Link>

        <Link href="/employee/requests" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Time Off</h2>
              <p className="text-sm text-gray-500">
                {pendingTimeOff.length > 0 ? `${pendingTimeOff.length} pending` : 'Request PTO'}
              </p>
            </div>
          </div>
        </Link>

        <Link href="/employee/swaps" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Shift Swaps</h2>
              <p className="text-sm text-gray-500">
                {pendingSwaps.length > 0 ? `${pendingSwaps.length} pending` : 'Trade shifts'}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Upcoming Shifts */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Upcoming Shifts</h2>
          <Link href="/employee/schedule" className="text-sm text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>
        {upcomingShifts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>No upcoming shifts scheduled</p>
          </div>
        ) : (
          <div className="divide-y">
            {upcomingShifts.map((shift) => {
              const shiftDate = new Date(shift.date)
              const isToday = shiftDate.toDateString() === new Date().toDateString()
              const isTomorrow = shiftDate.toDateString() === new Date(Date.now() + 86400000).toDateString()

              return (
                <div key={shift.id} className={`p-4 flex items-center justify-between ${isToday ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-lg flex flex-col items-center justify-center ${
                      isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <span className="text-xs font-medium">
                        {shiftDate.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-lg font-bold">{shiftDate.getDate()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : shiftDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{shift.total_hours?.toFixed(1) || shift.duration_hours?.toFixed(1)}h</p>
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

      {/* Pending Requests */}
      {(pendingTimeOff.length > 0 || pendingSwaps.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6">
          {pendingTimeOff.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-900">Pending Time Off</h2>
              </div>
              <div className="divide-y">
                {pendingTimeOff.slice(0, 3).map((request) => (
                  <div key={request.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                        </p>
                        {request.reason && (
                          <p className="text-sm text-gray-500 truncate">{request.reason}</p>
                        )}
                      </div>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingSwaps.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-900">Pending Swaps</h2>
              </div>
              <div className="divide-y">
                {pendingSwaps.slice(0, 3).map((swap) => (
                  <div key={swap.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">Swap Request #{swap.id}</p>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
