'use client'

import { useState, useRef } from 'react'
import { dataIO, stores as storesApi, schedules as schedulesApi } from '@/lib/api'
import { Store, Schedule } from '@/types'
import { useEffect } from 'react'

type ImportType = 'employees' | 'historical_orders' | 'availability'
type ExportType = 'employees' | 'schedule' | 'labor_report'

interface ImportResult {
  success: boolean
  created?: number
  imported?: number
  skipped?: number
  total_rows?: number
  errors?: string[]
  message?: string
}

export default function DataManagementPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [stores, setStores] = useState<Store[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [selectedSchedule, setSelectedSchedule] = useState<number | null>(null)
  const [importType, setImportType] = useState<ImportType>('employees')
  const [exportType, setExportType] = useState<ExportType>('employees')
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('csv')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [createUsers, setCreateUsers] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    storesApi.list().then(setStores)
  }, [])

  useEffect(() => {
    if (selectedStore && exportType === 'schedule') {
      schedulesApi.list(selectedStore).then(setSchedules)
    }
  }, [selectedStore, exportType])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!selectedStore && importType !== 'availability') {
      setResult({ success: false, errors: ['Please select a store first'] })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      let response: ImportResult
      switch (importType) {
        case 'employees':
          response = await dataIO.importEmployees(file, selectedStore!, createUsers)
          break
        case 'historical_orders':
          response = await dataIO.importHistoricalOrders(file, selectedStore!)
          break
        case 'availability':
          response = await dataIO.importAvailability(file)
          break
        default:
          throw new Error('Invalid import type')
      }
      setResult(response)
    } catch (error: any) {
      setResult({
        success: false,
        errors: [error.response?.data?.detail || 'Import failed'],
      })
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExport = async () => {
    if (!selectedStore && exportType !== 'employees') {
      setResult({ success: false, errors: ['Please select a store first'] })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      let response: any
      let filename: string

      switch (exportType) {
        case 'employees':
          response = await dataIO.exportEmployees(selectedStore || undefined, exportFormat)
          filename = `employees_${new Date().toISOString().split('T')[0]}.${exportFormat}`
          break
        case 'schedule':
          if (!selectedSchedule) {
            setResult({ success: false, errors: ['Please select a schedule'] })
            setLoading(false)
            return
          }
          response = await dataIO.exportSchedule(selectedSchedule, exportFormat)
          filename = `schedule_${selectedSchedule}_${new Date().toISOString().split('T')[0]}.${exportFormat}`
          break
        case 'labor_report':
          if (!dateRange.start || !dateRange.end) {
            setResult({ success: false, errors: ['Please select date range'] })
            setLoading(false)
            return
          }
          response = await dataIO.exportLaborReport(selectedStore!, dateRange.start, dateRange.end, exportFormat)
          filename = `labor_report_${dateRange.start}_${dateRange.end}.${exportFormat}`
          break
        default:
          throw new Error('Invalid export type')
      }

      // Download the file
      const blob = new Blob([response.data], {
        type: exportFormat === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setResult({ success: true, message: `Successfully exported ${filename}` })
    } catch (error: any) {
      setResult({
        success: false,
        errors: [error.response?.data?.detail || 'Export failed'],
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadTemplate = async (templateType: ImportType) => {
    try {
      const response = await dataIO.downloadTemplate(templateType)
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${templateType}_template.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to download template:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import and export data for employees, schedules, and reports
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => { setActiveTab('import'); setResult(null) }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'import'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Import Data
          </button>
          <button
            onClick={() => { setActiveTab('export'); setResult(null) }}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Export Data
          </button>
        </nav>
      </div>

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Import Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Import Type
              </label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportType)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="employees">Employees</option>
                <option value="historical_orders">Historical Orders</option>
                <option value="availability">Availability</option>
              </select>
            </div>

            {/* Store Selection */}
            {importType !== 'availability' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Store
                </label>
                <select
                  value={selectedStore || ''}
                  onChange={(e) => setSelectedStore(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a store</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Create Users Option */}
          {importType === 'employees' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="createUsers"
                checked={createUsers}
                onChange={(e) => setCreateUsers(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="createUsers" className="text-sm text-gray-700">
                Create user accounts for imported employees
              </label>
            </div>
          )}

          {/* Template Download */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Download Template</h3>
            <p className="text-sm text-gray-500 mb-3">
              Download a CSV template with the correct format for importing data.
            </p>
            <button
              onClick={() => handleDownloadTemplate(importType)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download {importType.replace('_', ' ')} template
            </button>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
              <div className="space-y-1 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="flex text-sm text-gray-600">
                  <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                    <span>Upload a file</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="sr-only"
                      disabled={loading}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">CSV or Excel files</p>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Processing...</span>
            </div>
          )}
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Type
              </label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value as ExportType)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="employees">Employees</option>
                <option value="schedule">Schedule</option>
                <option value="labor_report">Labor Report</option>
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Format
              </label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
              </select>
            </div>
          </div>

          {/* Store Selection */}
          {exportType !== 'employees' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Store
              </label>
              <select
                value={selectedStore || ''}
                onChange={(e) => setSelectedStore(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Store Selection for Employees */}
          {exportType === 'employees' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Store (optional)
              </label>
              <select
                value={selectedStore || ''}
                onChange={(e) => setSelectedStore(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Schedule Selection */}
          {exportType === 'schedule' && selectedStore && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schedule
              </label>
              <select
                value={selectedSchedule || ''}
                onChange={(e) => setSelectedSchedule(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a schedule</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    Week of {schedule.week_start_date} ({schedule.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range for Labor Report */}
          {exportType === 'labor_report' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export {exportType.replace('_', ' ')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Result Message */}
      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.success ? (
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-800">
                {result.message || `Successfully imported ${result.created ?? result.imported ?? 0} records`}
              </span>
            </div>
          ) : (
            <div>
              <div className="flex items-center mb-2">
                <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-red-800 font-medium">Import failed</span>
              </div>
              {result.errors && result.errors.length > 0 && (
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {result.errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
