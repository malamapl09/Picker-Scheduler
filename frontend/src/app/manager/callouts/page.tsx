'use client'

import { useEffect, useState } from 'react'
import { callouts as calloutsApi, stores as storesApi, shifts as shiftsApi, schedules as schedulesApi } from '@/lib/api'
import { Store } from '@/types'

interface Employee {
  id: number
  first_name: string
  last_name: string
}

interface Shift {
  id: number
  schedule_id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  status: 'scheduled' | 'called_out' | 'covered' | 'no_show'
  callout_reason?: string
  callout_time?: string
  original_employee_id?: number
  covered_by_id?: number
  duration_hours: number
  employee?: Employee
  original_employee?: Employee
  covered_by?: Employee
}

interface ReplacementCandidate {
  employee_id: number
  first_name: string
  last_name: string
  is_available: boolean
  availability_note: string
  current_week_hours: number
  remaining_hours: number
  conflicts: string[]
}

interface ScheduledShift {
  id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  employee?: Employee
}

export default function CalloutManagementPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [calloutShifts, setCalloutShifts] = useState<Shift[]>([])
  const [todayShifts, setTodayShifts] = useState<ScheduledShift[]>([])
  const [loading, setLoading] = useState(true)
  const [includeCovered, setIncludeCovered] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modal states
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const [replacements, setReplacements] = useState<ReplacementCandidate[]>([])
  const [loadingReplacements, setLoadingReplacements] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Mark callout modal
  const [showMarkCalloutModal, setShowMarkCalloutModal] = useState(false)
  const [shiftToMarkCallout, setShiftToMarkCallout] = useState<ScheduledShift | null>(null)
  const [calloutReason, setCalloutReason] = useState('')

  useEffect(() => {
    storesApi.list().then(data => {
      setStores(data)
      if (data.length > 0) {
        setSelectedStore(data[0].id)
      }
    })
  }, [])

  const loadCallouts = async () => {
    setLoading(true)
    try {
      const data = await calloutsApi.list(selectedStore || undefined, undefined, undefined, includeCovered)
      setCalloutShifts(data)
    } catch (error) {
      console.error('Error loading callouts:', error)
    }
    setLoading(false)
  }

  const loadTodayShifts = async () => {
    if (!selectedStore) return
    try {
      // Get today's schedule
      const today = new Date().toISOString().split('T')[0]
      const scheduleList = await schedulesApi.list(selectedStore, 'published')
      if (scheduleList.length > 0) {
        const allShifts = await shiftsApi.list(scheduleList[0].id)
        // Filter to today's scheduled shifts
        const todayScheduled = allShifts.filter((s: Shift) =>
          s.date === today && s.status === 'scheduled'
        )
        setTodayShifts(todayScheduled)
      }
    } catch (error) {
      console.error('Error loading today shifts:', error)
    }
  }

  useEffect(() => {
    if (selectedStore) {
      loadCallouts()
      loadTodayShifts()
    }
  }, [selectedStore, includeCovered])

  const handleFindReplacements = async (shift: Shift) => {
    setSelectedShift(shift)
    setLoadingReplacements(true)
    setReplacements([])
    try {
      const data = await calloutsApi.findReplacements(shift.id)
      setReplacements(data)
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to find replacements'
      })
    }
    setLoadingReplacements(false)
  }

  const handleAssignReplacement = async (employeeId: number, force: boolean = false) => {
    if (!selectedShift) return
    setProcessing(true)
    setMessage(null)
    try {
      await calloutsApi.assignReplacement(selectedShift.id, employeeId, force)
      setMessage({ type: 'success', text: 'Replacement assigned successfully!' })
      setSelectedShift(null)
      setReplacements([])
      loadCallouts()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (error.response?.status === 409 && detail?.includes('force=true')) {
        // Ask for confirmation
        if (confirm(`${detail}\n\nDo you want to proceed anyway?`)) {
          handleAssignReplacement(employeeId, true)
          return
        }
      }
      setMessage({
        type: 'error',
        text: typeof detail === 'string' ? detail : 'Failed to assign replacement'
      })
    }
    setProcessing(false)
  }

  const handleMarkCallout = async () => {
    if (!shiftToMarkCallout) return
    setProcessing(true)
    setMessage(null)
    try {
      await calloutsApi.markCallout(shiftToMarkCallout.id, calloutReason || undefined)
      setMessage({ type: 'success', text: 'Shift marked as call-out' })
      setShowMarkCalloutModal(false)
      setShiftToMarkCallout(null)
      setCalloutReason('')
      loadCallouts()
      loadTodayShifts()
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to mark call-out'
      })
    }
    setProcessing(false)
  }

  const handleRevertCallout = async (shiftId: number) => {
    if (!confirm('Are you sure you want to revert this call-out?')) return
    setProcessing(true)
    setMessage(null)
    try {
      await calloutsApi.revertCallout(shiftId)
      setMessage({ type: 'success', text: 'Call-out reverted successfully' })
      loadCallouts()
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to revert call-out'
      })
    }
    setProcessing(false)
  }

  const formatTime = (time: string) => time.slice(0, 5)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const uncoveredCount = calloutShifts.filter(s => s.status === 'called_out').length
  const coveredCount = calloutShifts.filter(s => s.status === 'covered').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call-Out Management</h1>
          <p className="text-gray-500">Handle call-outs and find quick replacements</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedStore || ''}
            onChange={(e) => setSelectedStore(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-red-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Needs Coverage</p>
              <p className="text-2xl font-bold text-red-600">{uncoveredCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-green-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Covered</p>
              <p className="text-2xl font-bold text-green-600">{coveredCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Shifts</p>
              <p className="text-2xl font-bold text-blue-600">{todayShifts.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Quick Actions - Today's Shifts */}
      {todayShifts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">Quick Mark Call-Out</h2>
            <p className="text-sm text-gray-500">Today's scheduled shifts - click to mark as call-out</p>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {todayShifts.map((shift) => (
                <button
                  key={shift.id}
                  onClick={() => {
                    setShiftToMarkCallout(shift)
                    setShowMarkCalloutModal(true)
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-red-50 hover:border-red-200 border rounded-lg text-sm transition-colors group"
                >
                  <span className="font-medium text-gray-900 group-hover:text-red-700">
                    {shift.employee?.first_name} {shift.employee?.last_name}
                  </span>
                  <span className="text-gray-500 group-hover:text-red-600 ml-2">
                    {formatTime(shift.start_time)}-{formatTime(shift.end_time)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Toggle */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeCovered}
            onChange={(e) => setIncludeCovered(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Show covered call-outs</span>
        </label>
      </div>

      {/* Call-outs List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Call-Outs</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : calloutShifts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No call-outs to display</p>
            <p className="text-sm mt-1">All shifts are covered!</p>
          </div>
        ) : (
          <div className="divide-y">
            {calloutShifts.map((shift) => (
              <div key={shift.id} className={`p-5 ${shift.status === 'called_out' ? 'bg-red-50' : ''}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Shift Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                        shift.status === 'called_out'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {shift.status === 'called_out' ? 'Needs Coverage' : 'Covered'}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(shift.date)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Original Employee */}
                      <div className="p-3 bg-white rounded-lg border">
                        <p className="text-xs text-gray-500 mb-1">Called Out</p>
                        <p className="font-semibold text-gray-900">
                          {shift.original_employee?.first_name || shift.employee?.first_name}{' '}
                          {shift.original_employee?.last_name || shift.employee?.last_name}
                        </p>
                        <p className="text-sm text-gray-600">
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                          <span className="text-gray-400 ml-2">({shift.duration_hours.toFixed(1)}hrs)</span>
                        </p>
                      </div>

                      {/* Coverage Info */}
                      <div className="p-3 bg-white rounded-lg border">
                        <p className="text-xs text-gray-500 mb-1">
                          {shift.status === 'covered' ? 'Covered By' : 'Replacement Needed'}
                        </p>
                        {shift.status === 'covered' && shift.covered_by ? (
                          <p className="font-semibold text-green-700">
                            {shift.covered_by.first_name} {shift.covered_by.last_name}
                          </p>
                        ) : (
                          <p className="text-red-600 font-medium">Not yet assigned</p>
                        )}
                      </div>
                    </div>

                    {/* Reason */}
                    {shift.callout_reason && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <span className="font-medium">Reason:</span> {shift.callout_reason}
                        </p>
                      </div>
                    )}

                    {/* Callout Time */}
                    {shift.callout_time && (
                      <p className="text-xs text-gray-400 mt-2">
                        Reported at {new Date(shift.callout_time).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {shift.status === 'called_out' && (
                      <>
                        <button
                          onClick={() => handleRevertCallout(shift.id)}
                          disabled={processing}
                          className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                        >
                          Revert
                        </button>
                        <button
                          onClick={() => handleFindReplacements(shift)}
                          disabled={processing}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Find Replacement
                        </button>
                      </>
                    )}
                    {shift.status === 'covered' && (
                      <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Resolved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Find Replacement Modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSelectedShift(null)}></div>
            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Find Replacement</h3>
                  <p className="text-sm text-gray-500">
                    {formatDate(selectedShift.date)} {formatTime(selectedShift.start_time)}-{formatTime(selectedShift.end_time)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedShift(null)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {loadingReplacements ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : replacements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p>No employees available from this store</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-green-100 border border-green-300"></span>
                        Available
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></span>
                        Has Conflicts
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></span>
                        Not Available
                      </span>
                    </div>

                    {replacements.map((candidate) => (
                      <div
                        key={candidate.employee_id}
                        className={`p-4 rounded-lg border ${
                          candidate.is_available
                            ? 'border-green-200 bg-green-50'
                            : candidate.conflicts.length > 0
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {candidate.first_name} {candidate.last_name}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                candidate.is_available
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {candidate.availability_note}
                              </span>
                            </div>
                            <div className="mt-1 text-sm text-gray-600">
                              <span>Week hours: {candidate.current_week_hours}hrs</span>
                              <span className="mx-2">|</span>
                              <span className={candidate.remaining_hours < 8 ? 'text-orange-600 font-medium' : ''}>
                                Remaining: {candidate.remaining_hours}hrs
                              </span>
                            </div>
                            {candidate.conflicts.length > 0 && (
                              <ul className="mt-2 text-sm text-amber-700">
                                {candidate.conflicts.map((conflict, idx) => (
                                  <li key={idx} className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    {conflict}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            onClick={() => handleAssignReplacement(candidate.employee_id)}
                            disabled={processing}
                            className={`px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${
                              candidate.is_available
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {processing ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            ) : (
                              'Assign'
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark Call-Out Modal */}
      {showMarkCalloutModal && shiftToMarkCallout && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setShowMarkCalloutModal(false)}></div>
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Mark as Call-Out</h3>
              </div>
              <div className="p-6">
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">
                    {shiftToMarkCallout.employee?.first_name} {shiftToMarkCallout.employee?.last_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formatDate(shiftToMarkCallout.date)} {formatTime(shiftToMarkCallout.start_time)}-{formatTime(shiftToMarkCallout.end_time)}
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason (optional)
                  </label>
                  <textarea
                    value={calloutReason}
                    onChange={(e) => setCalloutReason(e.target.value)}
                    placeholder="e.g., Sick, Personal emergency, No show..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMarkCalloutModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkCallout}
                    disabled={processing}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Mark Call-Out'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-2">Call-Out Management Tips</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Available employees are sorted by remaining weekly hours (highest first)</li>
          <li>Green candidates have no conflicts and can be assigned immediately</li>
          <li>Yellow candidates have some conflicts but may still be assignable</li>
          <li>The system checks availability, existing shifts, time-off, and 44hr weekly limits</li>
          <li>Notifications are automatically sent to both the original and replacement employees</li>
        </ul>
      </div>
    </div>
  )
}
