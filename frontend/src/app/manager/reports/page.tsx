'use client'

import { useEffect, useState } from 'react'
import { stores as storesApi, reports, forecasts } from '@/lib/api'
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

export default function ReportsPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState(formatDate(getMonday(new Date())))
  const [loading, setLoading] = useState(true)
  const [laborSummary, setLaborSummary] = useState<any>(null)
  const [coverageReport, setCoverageReport] = useState<any>(null)
  const [utilizationReport, setUtilizationReport] = useState<any>(null)
  const [forecastData, setForecastData] = useState<any>(null)
  const [complianceReport, setComplianceReport] = useState<any>(null)

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

    Promise.all([
      reports.laborSummary(selectedStore, currentWeek, formatDate(weekEnd)).catch(() => null),
      reports.coverage(selectedStore, currentWeek).catch(() => null),
      reports.utilization(selectedStore, currentWeek).catch(() => null),
      reports.compliance(currentWeek, selectedStore).catch(() => null),
      forecasts.getWeek(selectedStore, currentWeek).catch(() => null),
    ]).then(([labor, coverage, utilization, compliance, forecast]) => {
      setLaborSummary(labor)
      setCoverageReport(coverage)
      setUtilizationReport(utilization)
      setComplianceReport(compliance)
      setForecastData(forecast)
      setLoading(false)
    })
  }, [selectedStore, currentWeek])

  const changeWeek = (direction: number) => {
    const current = new Date(currentWeek)
    current.setDate(current.getDate() + (direction * 7))
    setCurrentWeek(formatDate(current))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Labor and coverage analytics</p>
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
              Week of {new Date(currentWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-100 rounded-r-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <p className="text-sm text-gray-500">Scheduled Hours</p>
              <p className="text-2xl font-bold text-gray-900">
                {laborSummary?.scheduled_hours?.toFixed(1) || '0'}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <p className="text-sm text-gray-500">Forecasted Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {laborSummary?.forecasted_orders?.toFixed(0) || forecastData?.total_orders?.toFixed(0) || '0'}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <p className="text-sm text-gray-500">Coverage Score</p>
              <p className={`text-2xl font-bold ${
                (coverageReport?.coverage_score || 0) >= 90 ? 'text-green-600' :
                (coverageReport?.coverage_score || 0) >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {coverageReport?.coverage_score?.toFixed(0) || '0'}%
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <p className="text-sm text-gray-500">Utilization</p>
              <p className="text-2xl font-bold text-blue-600">
                {utilizationReport?.overall_utilization?.toFixed(0) || '0'}%
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border">
              <p className="text-sm text-gray-500">Compliance</p>
              <p className={`text-2xl font-bold ${
                complianceReport?.compliant ? 'text-green-600' : 'text-red-600'
              }`}>
                {complianceReport?.compliant ? 'Compliant' : 'Issues'}
              </p>
            </div>
          </div>

          {/* Coverage Details */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Coverage Analysis</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Understaffed Periods</h3>
                <p className="text-3xl font-bold text-red-600">
                  {coverageReport?.understaffed_periods || 0}
                </p>
                {coverageReport?.understaffed_hours?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {coverageReport.understaffed_hours.slice(0, 5).map((period: any, i: number) => (
                      <div key={i} className="text-sm text-gray-600">
                        {new Date(period.date).toLocaleDateString('en-US', { weekday: 'short' })} @ {period.hour}:00 - Gap: {period.gap.toFixed(1)}h
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Overstaffed Periods</h3>
                <p className="text-3xl font-bold text-yellow-600">
                  {coverageReport?.overstaffed_periods || 0}
                </p>
                {coverageReport?.overstaffed_hours?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {coverageReport.overstaffed_hours.slice(0, 5).map((period: any, i: number) => (
                      <div key={i} className="text-sm text-gray-600">
                        {new Date(period.date).toLocaleDateString('en-US', { weekday: 'short' })} @ {period.hour}:00 - Excess: {period.excess.toFixed(1)}h
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Employee Utilization */}
          {utilizationReport?.employees && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Employee Utilization</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Employee</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Hours Scheduled</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Hours Remaining</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Days Worked</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Utilization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {utilizationReport.employees.map((emp: any) => (
                      <tr key={emp.employee_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.employee_name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{emp.hours_scheduled.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-gray-600">{emp.hours_remaining.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-gray-600">{emp.days_worked}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            emp.utilization_percent >= 80 ? 'text-green-600' :
                            emp.utilization_percent >= 50 ? 'text-yellow-600' : 'text-gray-400'
                          }`}>
                            {emp.utilization_percent.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Issues */}
          {complianceReport && !complianceReport.compliant && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-900 mb-4">Compliance Issues</h2>
              <div className="space-y-4">
                {complianceReport.violations?.map((v: any, i: number) => (
                  <div key={i} className="p-3 bg-white rounded-lg border border-red-200">
                    <p className="font-medium text-red-800">{v.type}</p>
                    <p className="text-sm text-red-600">{v.message}</p>
                  </div>
                ))}
                {complianceReport.warnings?.map((w: any, i: number) => (
                  <div key={i} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="font-medium text-yellow-800">{w.type}</p>
                    <p className="text-sm text-yellow-600">{w.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
