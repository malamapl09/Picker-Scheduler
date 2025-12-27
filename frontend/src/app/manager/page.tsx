'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { stores as storesApi, schedules as schedulesApi, employees as employeesApi, reports, forecasts, timeOff } from '@/lib/api'
import { Store, Schedule, Employee } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export default function ManagerDashboard() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState(formatDate(getMonday(new Date())))
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    employeeCount: 0,
    scheduledHours: 0,
    coverageScore: 0,
    pendingTimeOff: 0,
    forecastedOrders: 0,
    currentScheduleStatus: 'none' as 'none' | 'draft' | 'published',
  })

  useEffect(() => {
    storesApi.list().then(data => {
      setStores(data)
      if (data.length > 0) {
        setSelectedStore(data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedStore) return

    setLoading(true)

    Promise.all([
      employeesApi.list(selectedStore),
      schedulesApi.list(selectedStore),
      reports.coverage(selectedStore, currentWeek).catch(() => ({ coverage_score: 0, total_scheduled_hours: 0 })),
      forecasts.getWeek(selectedStore, currentWeek).catch(() => ({ total_orders: 0 })),
      timeOff.list(undefined, 'pending').catch(() => []),
    ]).then(([employees, schedules, coverage, forecast, pendingTimeOff]) => {
      const currentSchedule = schedules.find((s: Schedule) => s.week_start_date === currentWeek)

      setMetrics({
        employeeCount: employees.length,
        scheduledHours: coverage.total_scheduled_hours || 0,
        coverageScore: coverage.coverage_score || 0,
        pendingTimeOff: pendingTimeOff.length || 0,
        forecastedOrders: forecast.total_orders || 0,
        currentScheduleStatus: currentSchedule?.status || 'none',
      })
      setLoading(false)
    })
  }, [selectedStore, currentWeek])

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Overview of your store's scheduling</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedStore || ''}
            onChange={(e) => setSelectedStore(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={currentWeek}
            onChange={(e) => setCurrentWeek(formatDate(getMonday(new Date(e.target.value))))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Employees</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.employeeCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Scheduled Hours</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.scheduledHours.toFixed(1)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Coverage Score</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.coverageScore.toFixed(0)}%</p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              metrics.coverageScore >= 90 ? 'bg-green-100' :
              metrics.coverageScore >= 70 ? 'bg-yellow-100' : 'bg-red-100'
            }`}>
              <svg className={`w-6 h-6 ${
                metrics.coverageScore >= 90 ? 'text-green-600' :
                metrics.coverageScore >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Requests</p>
              <p className="text-2xl font-bold text-gray-900">{metrics.pendingTimeOff}</p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              metrics.pendingTimeOff > 0 ? 'bg-orange-100' : 'bg-gray-100'
            }`}>
              <svg className={`w-6 h-6 ${metrics.pendingTimeOff > 0 ? 'text-orange-600' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Week Overview */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Week of {new Date(currentWeek).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${
              metrics.currentScheduleStatus === 'published' ? 'bg-green-100 text-green-800' :
              metrics.currentScheduleStatus === 'draft' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {metrics.currentScheduleStatus === 'published' ? 'Published' :
               metrics.currentScheduleStatus === 'draft' ? 'Draft' : 'No Schedule'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b">
          {weekDates.map((date, i) => (
            <div key={i} className="p-3 text-center border-r last:border-r-0">
              <p className="text-xs text-gray-500">{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
              <p className="text-lg font-semibold text-gray-900">{date.getDate()}</p>
            </div>
          ))}
        </div>
        <div className="p-5 flex items-center justify-center">
          <Link
            href={`/manager/schedules?week=${currentWeek}&store=${selectedStore}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            View Schedule
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/manager/schedules/new" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Create Schedule</h3>
              <p className="text-sm text-gray-500">Generate optimized schedule</p>
            </div>
          </div>
        </Link>

        <Link href="/manager/time-off" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Review Time Off</h3>
              <p className="text-sm text-gray-500">{metrics.pendingTimeOff} pending requests</p>
            </div>
          </div>
        </Link>

        <Link href="/manager/reports" className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">View Reports</h3>
              <p className="text-sm text-gray-500">Labor and coverage metrics</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Forecasted Orders Summary */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Demand Forecast</h2>
          <span className="text-2xl font-bold text-blue-600">{metrics.forecastedOrders.toFixed(0)} orders</span>
        </div>
        <p className="text-sm text-gray-500">
          Forecasted order volume for the week. Use this to plan optimal staffing levels.
        </p>
      </div>
    </div>
  )
}
