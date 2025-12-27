'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { stores as storesApi, optimizer, forecasts, employees as employeesApi, schedules as schedulesApi } from '@/lib/api'
import { Store, Employee, WeeklyForecast, OptimizationResult } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

type Step = 'store' | 'week' | 'preview' | 'review' | 'complete'

export default function NewSchedulePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [currentStep, setCurrentStep] = useState<Step>('store')
  const [stores, setStores] = useState<Store[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(formatDate(getMonday(new Date())))
  const [forecast, setForecast] = useState<WeeklyForecast | null>(null)
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [createdScheduleId, setCreatedScheduleId] = useState<number | null>(null)

  // Load initial data
  useEffect(() => {
    storesApi.list().then(data => {
      setStores(data)
      const storeParam = searchParams.get('store')
      if (storeParam) {
        setSelectedStore(Number(storeParam))
      } else if (data.length > 0) {
        setSelectedStore(data[0].id)
      }

      const weekParam = searchParams.get('week')
      if (weekParam) {
        setSelectedWeek(weekParam)
      }

      setLoading(false)
    })
  }, [searchParams])

  // Load employees when store changes
  useEffect(() => {
    if (selectedStore) {
      employeesApi.list(selectedStore).then(setEmployees)
    }
  }, [selectedStore])

  const loadForecast = async () => {
    if (!selectedStore) return

    setLoading(true)
    setError(null)

    try {
      // Try to get existing forecast, generate if none exists
      let forecastData = await forecasts.getWeek(selectedStore, selectedWeek).catch(() => null)

      if (!forecastData) {
        // Generate forecast
        forecastData = await forecasts.generate({ store_id: selectedStore, week_start: selectedWeek })
      }

      setForecast(forecastData)
      setCurrentStep('preview')
    } catch (err) {
      setError('Failed to load demand forecast. Please try again.')
      console.error(err)
    }

    setLoading(false)
  }

  const generateSchedule = async () => {
    if (!selectedStore) return

    setGenerating(true)
    setError(null)

    try {
      const result = await optimizer.generate(selectedStore, selectedWeek)
      setOptimizationResult(result)
      setCurrentStep('review')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate schedule. Please try again.')
      console.error(err)
    }

    setGenerating(false)
  }

  const saveSchedule = async () => {
    if (!selectedStore || !optimizationResult) return

    setSaving(true)
    setError(null)

    try {
      // Create a new schedule
      const schedule = await schedulesApi.create({
        store_id: selectedStore,
        week_start_date: selectedWeek,
        status: 'draft'
      })

      // Apply the optimization result
      await optimizer.apply(schedule.id, optimizationResult.shifts)

      setCreatedScheduleId(schedule.id)
      setCurrentStep('complete')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save schedule. Please try again.')
      console.error(err)
    }

    setSaving(false)
  }

  const steps = [
    { id: 'store', label: 'Select Store', icon: '1' },
    { id: 'week', label: 'Choose Week', icon: '2' },
    { id: 'preview', label: 'Review Demand', icon: '3' },
    { id: 'review', label: 'Review Schedule', icon: '4' },
    { id: 'complete', label: 'Complete', icon: '5' },
  ]

  const getStepIndex = (step: Step) => steps.findIndex(s => s.id === step)

  if (loading && currentStep === 'store') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Schedule</h1>
          <p className="text-gray-500">Generate an optimized schedule for your store</p>
        </div>
        <Link
          href="/manager/schedules"
          className="px-4 py-2 text-gray-600 hover:text-gray-900"
        >
          Cancel
        </Link>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                getStepIndex(currentStep) > index
                  ? 'bg-green-600 text-white'
                  : getStepIndex(currentStep) === index
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {getStepIndex(currentStep) > index ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>
              <span className={`ml-2 text-sm font-medium ${
                getStepIndex(currentStep) >= index ? 'text-gray-900' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div className={`w-12 lg:w-24 h-1 mx-2 rounded ${
                  getStepIndex(currentStep) > index ? 'bg-green-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        {/* Step 1: Select Store */}
        {currentStep === 'store' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Select Store</h2>
            <p className="text-gray-500">Choose the store you want to create a schedule for.</p>

            <div className="grid md:grid-cols-2 gap-4">
              {stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => setSelectedStore(store.id)}
                  className={`p-4 border-2 rounded-xl text-left transition-colors ${
                    selectedStore === store.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">{store.name}</h3>
                  <p className="text-sm text-gray-500">{store.code}</p>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setCurrentStep('week')}
                disabled={!selectedStore}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Choose Week */}
        {currentStep === 'week' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Choose Week</h2>
            <p className="text-gray-500">Select the week for which you want to generate a schedule.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Week Starting
              </label>
              <input
                type="date"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(formatDate(getMonday(new Date(e.target.value))))}
                className="w-full max-w-xs px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-2 text-sm text-gray-500">
                Week of {new Date(selectedWeek).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Store Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Store:</span>
                  <span className="ml-2 font-medium">{stores.find(s => s.id === selectedStore)?.name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Employees:</span>
                  <span className="ml-2 font-medium">{employees.length}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('store')}
                className="px-6 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={loadForecast}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Load Forecast
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Demand */}
        {currentStep === 'preview' && forecast && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Review Demand Forecast</h2>
            <p className="text-gray-500">Review the forecasted order volume before generating the schedule.</p>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Total Orders</p>
                <p className="text-2xl font-bold text-blue-900">{forecast.total_orders?.toFixed(0) || '0'}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">Required Hours</p>
                <p className="text-2xl font-bold text-green-900">{forecast.total_picker_hours?.toFixed(0) || '0'}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-600">Available Staff</p>
                <p className="text-2xl font-bold text-purple-900">{employees.length}</p>
              </div>
            </div>

            {/* Daily Breakdown */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Daily Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Day</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Orders</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Peak Hour</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Required Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {forecast.daily_forecasts?.map((day, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium">
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-2 text-right">{day.total_orders?.toFixed(0) || '0'}</td>
                        <td className="px-4 py-2 text-right">{day.peak_hour || '-'}:00</td>
                        <td className="px-4 py-2 text-right">{day.total_picker_hours?.toFixed(1) || '0'}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('week')}
                className="px-6 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={generateSchedule}
                disabled={generating}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {generating && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Generate Schedule
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review Schedule */}
        {currentStep === 'review' && optimizationResult && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Review Generated Schedule</h2>
            <p className="text-gray-500">Review the optimized schedule before saving.</p>

            {/* Optimization Stats */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600">Coverage Score</p>
                <p className="text-2xl font-bold text-green-900">
                  {optimizationResult.stats?.coverage_score?.toFixed(0) || '0'}%
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Total Shifts</p>
                <p className="text-2xl font-bold text-blue-900">
                  {optimizationResult.shifts?.length || 0}
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-600">Total Hours</p>
                <p className="text-2xl font-bold text-purple-900">
                  {optimizationResult.stats?.total_hours?.toFixed(0) || '0'}
                </p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-600">Employees Used</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {optimizationResult.stats?.employees_scheduled || 0}
                </p>
              </div>
            </div>

            {/* Compliance Status */}
            {optimizationResult.compliance_issues && optimizationResult.compliance_issues.length > 0 ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-medium text-red-900 mb-2">Compliance Warnings</h3>
                <ul className="space-y-1 text-sm text-red-700">
                  {optimizationResult.compliance_issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium text-green-900">All compliance rules satisfied</span>
                </div>
              </div>
            )}

            {/* Shift Preview */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Shift Preview (first 10)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Employee</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Time</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {optimizationResult.shifts?.slice(0, 10).map((shift, i) => {
                      const emp = employees.find(e => e.id === shift.employee_id)
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium">
                            {emp ? `${emp.first_name} ${emp.last_name}` : `Employee ${shift.employee_id}`}
                          </td>
                          <td className="px-4 py-2">
                            {new Date(shift.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-2">
                            {shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}
                          </td>
                          <td className="px-4 py-2 text-right">{shift.hours?.toFixed(1) || '-'}h</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {(optimizationResult.shifts?.length || 0) > 10 && (
                  <p className="text-sm text-gray-500 mt-2 px-4">
                    ... and {optimizationResult.shifts!.length - 10} more shifts
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('preview')}
                className="px-6 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={saveSchedule}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Save Schedule
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Complete */}
        {currentStep === 'complete' && (
          <div className="text-center py-8 space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Schedule Created Successfully!</h2>
              <p className="text-gray-500 mt-2">
                Your schedule has been saved as a draft. You can now review and publish it.
              </p>
            </div>
            <div className="flex justify-center gap-4">
              <Link
                href="/manager/schedules"
                className="px-6 py-2 border text-gray-700 rounded-lg hover:bg-gray-50"
              >
                View All Schedules
              </Link>
              <Link
                href={`/manager/schedules?week=${selectedWeek}&store=${selectedStore}`}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                View Schedule
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
