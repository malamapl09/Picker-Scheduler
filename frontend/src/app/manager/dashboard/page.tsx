'use client'

import { useEffect, useState } from 'react'
import { stores as storesApi, reports } from '@/lib/api'
import { Store } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

interface TrendData {
  week_label: string
  week_start: string
  scheduled_hours: number
  labor_cost: number
  efficiency_score: number
  coverage_score: number
  hours_change?: number
  cost_change?: number
  efficiency_change?: number
  coverage_change?: number
}

interface LaborCostData {
  summary: {
    total_hours: number
    regular_hours: number
    overtime_hours: number
    total_cost: number
    regular_cost: number
    overtime_cost: number
    total_shifts: number
    unique_employees: number
    forecasted_orders: number
    cost_per_order: number
    orders_per_labor_dollar: number
  }
  daily_breakdown: Record<string, { hours: number; cost: number; shifts: number; unique_employees: number }>
  employee_breakdown: Array<{
    employee_id: number
    employee_name: string
    total_hours: number
    regular_hours: number
    overtime_hours: number
    total_cost: number
    shifts: number
  }>
}

interface EfficiencyData {
  summary: {
    total_scheduled_hours: number
    total_forecasted_orders: number
    actual_orders_per_hour: number
    target_orders_per_hour: number
    efficiency_score: number
    efficiency_status: string
  }
  daily_breakdown: Record<string, { scheduled_hours: number; forecasted_orders: number; actual_oph: number; efficiency_score: number }>
  peak_hours: Array<{ hour: number; orders_per_hour: number; efficiency: number }>
  off_peak_hours: Array<{ hour: number; orders_per_hour: number; efficiency: number }>
}

export default function DashboardPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState(formatDate(getMonday(new Date())))
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'cost' | 'efficiency' | 'trends'>('overview')
  const [hourlyRate, setHourlyRate] = useState(15)

  const [laborCost, setLaborCost] = useState<LaborCostData | null>(null)
  const [efficiency, setEfficiency] = useState<EfficiencyData | null>(null)
  const [trends, setTrends] = useState<{ averages: any; weekly_data: TrendData[] } | null>(null)
  const [storeComparison, setStoreComparison] = useState<any>(null)

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
    const weekEnd = new Date(currentWeek)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const endDateStr = formatDate(weekEnd)

    Promise.all([
      reports.laborCost(selectedStore, currentWeek, endDateStr, hourlyRate).catch(() => null),
      reports.efficiency(selectedStore, currentWeek, endDateStr).catch(() => null),
      reports.trends(selectedStore, 8).catch(() => null),
      reports.storeComparison(currentWeek).catch(() => null),
    ]).then(([cost, eff, trend, comparison]) => {
      setLaborCost(cost)
      setEfficiency(eff)
      setTrends(trend)
      setStoreComparison(comparison)
      setLoading(false)
    })
  }, [selectedStore, currentWeek, hourlyRate])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labor Cost & Efficiency Dashboard</h1>
          <p className="text-gray-500">Track costs, productivity, and performance trends</p>
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
            <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-100 rounded-l-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-3 py-2 text-sm font-medium">
              {new Date(currentWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-100 rounded-r-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Rate:</label>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="w-20 px-2 py-1 border rounded-lg text-sm"
              min={1}
            />
            <span className="text-sm text-gray-500">/hr</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'cost', label: 'Labor Cost' },
            { key: 'efficiency', label: 'Efficiency' },
            { key: 'trends', label: 'Trends' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total Labor Cost</p>
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {formatCurrency(laborCost?.summary?.total_cost || 0)}
                  </p>
                  {trends?.weekly_data?.length && trends.weekly_data[trends.weekly_data.length - 1]?.cost_change !== undefined && (
                    <p className={`text-sm mt-1 ${
                      (trends.weekly_data[trends.weekly_data.length - 1]?.cost_change || 0) > 0 ? 'text-red-500' : 'text-green-500'
                    }`}>
                      {(trends.weekly_data[trends.weekly_data.length - 1]?.cost_change || 0) > 0 ? '+' : ''}
                      {formatCurrency(trends.weekly_data[trends.weekly_data.length - 1]?.cost_change || 0)} vs last week
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Efficiency Score</p>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      (efficiency?.summary?.efficiency_score || 0) >= 100 ? 'bg-green-100' :
                      (efficiency?.summary?.efficiency_score || 0) >= 80 ? 'bg-yellow-100' : 'bg-red-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        (efficiency?.summary?.efficiency_score || 0) >= 100 ? 'text-green-600' :
                        (efficiency?.summary?.efficiency_score || 0) >= 80 ? 'text-yellow-600' : 'text-red-600'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold mt-2 ${
                    (efficiency?.summary?.efficiency_score || 0) >= 100 ? 'text-green-600' :
                    (efficiency?.summary?.efficiency_score || 0) >= 80 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {efficiency?.summary?.efficiency_score?.toFixed(1) || 0}%
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {efficiency?.summary?.actual_orders_per_hour?.toFixed(1)} / {efficiency?.summary?.target_orders_per_hour} orders/hr
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Cost per Order</p>
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    ${laborCost?.summary?.cost_per_order?.toFixed(2) || '0.00'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {laborCost?.summary?.forecasted_orders?.toLocaleString() || 0} orders forecasted
                  </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total Hours</p>
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {laborCost?.summary?.total_hours?.toFixed(1) || 0}h
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {laborCost?.summary?.overtime_hours?.toFixed(1) || 0}h overtime
                  </p>
                </div>
              </div>

              {/* Daily Cost Chart */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Labor Cost</h2>
                <div className="h-64 flex items-end gap-2">
                  {laborCost?.daily_breakdown && Object.entries(laborCost.daily_breakdown).map(([date, data]) => {
                    const maxCost = Math.max(...Object.values(laborCost.daily_breakdown).map(d => d.cost))
                    const height = maxCost > 0 ? (data.cost / maxCost) * 100 : 0
                    return (
                      <div key={date} className="flex-1 flex flex-col items-center gap-2">
                        <div
                          className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                          style={{ height: `${height}%`, minHeight: data.cost > 0 ? '8px' : '0' }}
                          title={`${formatCurrency(data.cost)}`}
                        />
                        <div className="text-center">
                          <p className="text-xs text-gray-500">
                            {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
                          </p>
                          <p className="text-xs font-medium">{formatCurrency(data.cost)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Store Comparison */}
              {storeComparison?.stores && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Store Comparison</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Store</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Hours</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Cost</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Orders</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">$/Order</th>
                          <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Efficiency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {storeComparison.stores.slice(0, 10).map((store: any) => (
                          <tr key={store.store_id} className={`hover:bg-gray-50 ${store.store_id === selectedStore ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{store.store_name}</span>
                                {store.store_id === selectedStore && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Current</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">{store.scheduled_hours.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(store.labor_cost)}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{store.forecasted_orders.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-gray-600">${store.cost_per_order.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-medium ${
                                store.efficiency_score >= 100 ? 'text-green-600' :
                                store.efficiency_score >= 80 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {store.efficiency_score.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Labor Cost Tab */}
          {activeTab === 'cost' && laborCost && (
            <div className="space-y-6">
              {/* Cost Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Regular Hours</p>
                  <p className="text-2xl font-bold text-gray-900">{laborCost.summary.regular_hours.toFixed(1)}h</p>
                  <p className="text-sm text-gray-500">{formatCurrency(laborCost.summary.regular_cost)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Overtime Hours</p>
                  <p className="text-2xl font-bold text-amber-600">{laborCost.summary.overtime_hours.toFixed(1)}h</p>
                  <p className="text-sm text-amber-600">{formatCurrency(laborCost.summary.overtime_cost)} (1.5x)</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Total Shifts</p>
                  <p className="text-2xl font-bold text-gray-900">{laborCost.summary.total_shifts}</p>
                  <p className="text-sm text-gray-500">{laborCost.summary.unique_employees} employees</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Orders per $</p>
                  <p className="text-2xl font-bold text-blue-600">{laborCost.summary.orders_per_labor_dollar.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">labor efficiency ratio</p>
                </div>
              </div>

              {/* Employee Breakdown */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b">
                  <h2 className="text-lg font-semibold text-gray-900">Employee Labor Cost</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Employee</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Shifts</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Regular</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Overtime</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Total Hours</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {laborCost.employee_breakdown.map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{emp.employee_name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{emp.shifts}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{emp.regular_hours.toFixed(1)}h</td>
                          <td className="px-4 py-3 text-right">
                            <span className={emp.overtime_hours > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                              {emp.overtime_hours.toFixed(1)}h
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{emp.total_hours.toFixed(1)}h</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(emp.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-gray-900">Total</td>
                        <td className="px-4 py-3 text-right font-semibold">{laborCost.summary.total_shifts}</td>
                        <td className="px-4 py-3 text-right font-semibold">{laborCost.summary.regular_hours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-600">{laborCost.summary.overtime_hours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right font-semibold">{laborCost.summary.total_hours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(laborCost.summary.total_cost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Efficiency Tab */}
          {activeTab === 'efficiency' && efficiency && (
            <div className="space-y-6">
              {/* Efficiency Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Actual Orders/Hour</p>
                  <p className="text-2xl font-bold text-gray-900">{efficiency.summary.actual_orders_per_hour.toFixed(1)}</p>
                  <p className="text-sm text-gray-500">vs target: {efficiency.summary.target_orders_per_hour}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Efficiency Score</p>
                  <p className={`text-2xl font-bold ${
                    efficiency.summary.efficiency_score >= 100 ? 'text-green-600' :
                    efficiency.summary.efficiency_score >= 80 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {efficiency.summary.efficiency_score.toFixed(1)}%
                  </p>
                  <p className={`text-sm capitalize ${
                    efficiency.summary.efficiency_status === 'excellent' ? 'text-green-600' :
                    efficiency.summary.efficiency_status === 'good' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {efficiency.summary.efficiency_status.replace('_', ' ')}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Peak Hours</p>
                  <p className="text-2xl font-bold text-green-600">{efficiency.peak_hours.length}</p>
                  <p className="text-sm text-gray-500">above target</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Off-Peak Hours</p>
                  <p className="text-2xl font-bold text-amber-600">{efficiency.off_peak_hours.length}</p>
                  <p className="text-sm text-gray-500">below target</p>
                </div>
              </div>

              {/* Daily Efficiency */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Efficiency</h2>
                <div className="space-y-3">
                  {Object.entries(efficiency.daily_breakdown).map(([date, data]) => (
                    <div key={date} className="flex items-center gap-4">
                      <span className="w-20 text-sm text-gray-500">
                        {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full transition-all ${
                            data.efficiency_score >= 100 ? 'bg-green-500' :
                            data.efficiency_score >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(data.efficiency_score, 100)}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-gray-600"
                          style={{ left: '100%', transform: 'translateX(-1px)' }}
                          title="Target"
                        />
                      </div>
                      <span className={`w-16 text-right text-sm font-medium ${
                        data.efficiency_score >= 100 ? 'text-green-600' :
                        data.efficiency_score >= 80 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {data.efficiency_score.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Peak vs Off-Peak */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    Peak Hours (Above Target)
                  </h3>
                  {efficiency.peak_hours.length > 0 ? (
                    <div className="space-y-2">
                      {efficiency.peak_hours.map((h) => (
                        <div key={h.hour} className="flex justify-between items-center p-2 bg-green-50 rounded">
                          <span className="text-sm">
                            {h.hour % 12 || 12}:00 {h.hour >= 12 ? 'PM' : 'AM'}
                          </span>
                          <span className="text-sm font-medium text-green-700">
                            {h.orders_per_hour.toFixed(1)} orders/hr ({h.efficiency.toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No hours above target this week</p>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                    Off-Peak Hours (Below Target)
                  </h3>
                  {efficiency.off_peak_hours.length > 0 ? (
                    <div className="space-y-2">
                      {efficiency.off_peak_hours.slice(0, 6).map((h) => (
                        <div key={h.hour} className="flex justify-between items-center p-2 bg-amber-50 rounded">
                          <span className="text-sm">
                            {h.hour % 12 || 12}:00 {h.hour >= 12 ? 'PM' : 'AM'}
                          </span>
                          <span className="text-sm font-medium text-amber-700">
                            {h.orders_per_hour.toFixed(1)} orders/hr ({h.efficiency.toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">All hours at or above target!</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && trends && (
            <div className="space-y-6">
              {/* Averages */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Avg Weekly Hours</p>
                  <p className="text-2xl font-bold text-gray-900">{trends.averages.avg_weekly_hours.toFixed(1)}h</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Avg Weekly Cost</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(trends.averages.avg_weekly_cost)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Avg Efficiency</p>
                  <p className={`text-2xl font-bold ${
                    trends.averages.avg_efficiency >= 100 ? 'text-green-600' :
                    trends.averages.avg_efficiency >= 80 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {trends.averages.avg_efficiency.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-5 border">
                  <p className="text-sm text-gray-500">Avg Coverage</p>
                  <p className={`text-2xl font-bold ${
                    trends.averages.avg_coverage >= 90 ? 'text-green-600' :
                    trends.averages.avg_coverage >= 70 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {trends.averages.avg_coverage.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Trend Chart */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Weekly Trends</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Week</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Hours</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Cost</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Orders</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Efficiency</th>
                        <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Coverage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {trends.weekly_data.map((week, index) => (
                        <tr key={week.week_start} className={`hover:bg-gray-50 ${
                          week.week_start === currentWeek ? 'bg-blue-50' : ''
                        }`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{week.week_label}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              {week.week_start === currentWeek && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Current</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-gray-900">{week.scheduled_hours.toFixed(1)}h</span>
                            {week.hours_change !== undefined && week.hours_change !== 0 && (
                              <span className={`text-xs ml-1 ${week.hours_change > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {week.hours_change > 0 ? '+' : ''}{week.hours_change.toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-gray-900">{formatCurrency(week.labor_cost)}</span>
                            {week.cost_change !== undefined && week.cost_change !== 0 && (
                              <span className={`text-xs ml-1 ${week.cost_change > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {week.cost_change > 0 ? '+' : ''}{formatCurrency(week.cost_change)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{week.forecasted_orders.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-medium ${
                              week.efficiency_score >= 100 ? 'text-green-600' :
                              week.efficiency_score >= 80 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {week.efficiency_score.toFixed(1)}%
                            </span>
                            {week.efficiency_change !== undefined && week.efficiency_change !== 0 && (
                              <span className={`text-xs ml-1 ${week.efficiency_change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {week.efficiency_change > 0 ? '+' : ''}{week.efficiency_change.toFixed(1)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-medium ${
                              week.coverage_score >= 90 ? 'text-green-600' :
                              week.coverage_score >= 70 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {week.coverage_score.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Visual Trend Bars */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Efficiency Trend</h2>
                <div className="h-48 flex items-end gap-2">
                  {trends.weekly_data.map((week) => {
                    const height = Math.min(week.efficiency_score, 120)
                    return (
                      <div key={week.week_start} className="flex-1 flex flex-col items-center gap-2">
                        <div className="relative w-full" style={{ height: '160px' }}>
                          <div
                            className={`absolute bottom-0 w-full rounded-t transition-all ${
                              week.efficiency_score >= 100 ? 'bg-green-500' :
                              week.efficiency_score >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ height: `${(height / 120) * 100}%` }}
                          />
                          {/* Target line */}
                          <div
                            className="absolute w-full h-0.5 bg-gray-400 border-dashed"
                            style={{ bottom: `${(100 / 120) * 100}%` }}
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">{week.week_label}</p>
                          <p className="text-xs font-medium">{week.efficiency_score.toFixed(0)}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-gray-400"></div>
                    <span>100% Target</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
