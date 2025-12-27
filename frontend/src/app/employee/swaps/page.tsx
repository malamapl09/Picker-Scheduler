'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { swaps as swapsApi, shifts as shiftsApi, employees as employeesApi } from '@/lib/api'
import { ShiftSwap, Shift, Employee } from '@/types'

interface ShiftWithEmployee extends Shift {
  employee?: Employee
}

interface SwapWithDetails extends ShiftSwap {
  requesterShift?: ShiftWithEmployee
  requestedShift?: ShiftWithEmployee
}

export default function ShiftSwapsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [myShifts, setMyShifts] = useState<Shift[]>([])
  const [availableSwaps, setAvailableSwaps] = useState<SwapWithDetails[]>([])
  const [mySwapRequests, setMySwapRequests] = useState<SwapWithDetails[]>([])
  const [showPostForm, setShowPostForm] = useState(false)
  const [selectedShift, setSelectedShift] = useState<number | null>(null)
  const [swapNotes, setSwapNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'available' | 'my-requests'>('available')

  const loadData = async (employeeId: number) => {
    try {
      const [shifts, swaps, available] = await Promise.all([
        shiftsApi.list(undefined, employeeId).catch(() => []),
        swapsApi.list(employeeId).catch(() => []),
        swapsApi.getAvailable(employeeId).catch(() => []),
      ])

      // Filter upcoming shifts only
      const upcomingShifts = shifts.filter((s: Shift) => new Date(s.date) >= new Date())
      setMyShifts(upcomingShifts)
      setMySwapRequests(swaps)
      setAvailableSwaps(available)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  useEffect(() => {
    if (!user) return

    const loadInitial = async () => {
      setLoading(true)
      try {
        const employees = await employeesApi.list()
        const currentEmployee = employees.find((e: Employee) => e.user_id === user.id)

        if (currentEmployee) {
          setEmployee(currentEmployee)
          await loadData(currentEmployee.id)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      }
      setLoading(false)
    }

    loadInitial()
  }, [user])

  const handlePostSwap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShift || !employee) return

    setSubmitting(true)
    setMessage(null)

    try {
      await swapsApi.create({
        requester_shift_id: selectedShift,
        notes: swapNotes || undefined,
      })

      await loadData(employee.id)
      setShowPostForm(false)
      setSelectedShift(null)
      setSwapNotes('')
      setMessage({ type: 'success', text: 'Shift posted for swap successfully!' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to post swap. Please try again.',
      })
    }

    setSubmitting(false)
  }

  const handleAcceptSwap = async (swapId: number, shiftId: number) => {
    if (!employee) return

    setSubmitting(true)
    setMessage(null)

    try {
      await swapsApi.accept(swapId, shiftId)
      await loadData(employee.id)
      setMessage({ type: 'success', text: 'Swap request accepted! Awaiting manager approval.' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to accept swap. Please try again.',
      })
    }

    setSubmitting(false)
  }

  const handleCancelSwap = async (swapId: number) => {
    if (!employee) return

    setSubmitting(true)
    setMessage(null)

    try {
      await swapsApi.cancel(swapId)
      await loadData(employee.id)
      setMessage({ type: 'success', text: 'Swap request cancelled.' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to cancel swap. Please try again.',
      })
    }

    setSubmitting(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'denied': return 'bg-red-100 text-red-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
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
          <h1 className="text-2xl font-bold text-gray-900">Shift Swaps</h1>
          <p className="text-gray-500">Trade shifts with coworkers</p>
        </div>
        <button
          onClick={() => setShowPostForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Post Shift for Swap
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Post Swap Form */}
      {showPostForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Post Shift for Swap</h2>
            <button
              onClick={() => setShowPostForm(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {myShifts.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p>You don't have any upcoming shifts to swap.</p>
            </div>
          ) : (
            <form onSubmit={handlePostSwap} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Shift to Swap
                </label>
                <div className="space-y-2">
                  {myShifts.map((shift) => {
                    const shiftDate = new Date(shift.date)
                    return (
                      <label
                        key={shift.id}
                        className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedShift === shift.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="shift"
                          value={shift.id}
                          checked={selectedShift === shift.id}
                          onChange={() => setSelectedShift(shift.id)}
                          className="mr-3"
                        />
                        <div>
                          <p className="font-medium text-gray-900">
                            {shiftDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                          </p>
                          <p className="text-sm text-gray-500">
                            {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} ({shift.total_hours || shift.duration_hours}h)
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={swapNotes}
                  onChange={(e) => setSwapNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g., Looking to swap for any morning shift..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPostForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedShift}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  Post for Swap
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'available'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Available Swaps ({availableSwaps.length})
        </button>
        <button
          onClick={() => setActiveTab('my-requests')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'my-requests'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Requests ({mySwapRequests.length})
        </button>
      </div>

      {/* Available Swaps */}
      {activeTab === 'available' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Available Shifts to Swap</h2>
            <p className="text-sm text-gray-500">Shifts your coworkers want to trade</p>
          </div>

          {availableSwaps.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <p>No shifts available for swap right now</p>
            </div>
          ) : (
            <div className="divide-y">
              {availableSwaps.map((swap) => {
                const shift = swap.requesterShift
                const shiftDate = shift ? new Date(shift.date) : null

                return (
                  <div key={swap.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {shift?.employee?.first_name} {shift?.employee?.last_name}'s Shift
                          </p>
                          {shiftDate && (
                            <p className="text-sm text-gray-500">
                              {shiftDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                          )}
                          {shift && (
                            <p className="text-sm text-gray-500">
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} ({shift.total_hours || shift.duration_hours}h)
                            </p>
                          )}
                        </div>
                      </div>
                      {myShifts.length > 0 && (
                        <div className="flex items-center gap-2">
                          <select
                            className="px-3 py-2 border rounded-lg text-sm"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAcceptSwap(swap.id, parseInt(e.target.value))
                              }
                            }}
                            defaultValue=""
                            disabled={submitting}
                          >
                            <option value="">Select your shift to trade...</option>
                            {myShifts.map((s) => (
                              <option key={s.id} value={s.id}>
                                {new Date(s.date).toLocaleDateString()} {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* My Swap Requests */}
      {activeTab === 'my-requests' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">My Swap Requests</h2>
            <p className="text-sm text-gray-500">Shifts you've posted for swap</p>
          </div>

          {mySwapRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>You haven't posted any shifts for swap</p>
              <button
                onClick={() => setShowPostForm(true)}
                className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
              >
                Post a shift for swap
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {mySwapRequests.map((swap) => {
                const shift = swap.requesterShift
                const shiftDate = shift ? new Date(shift.date) : null

                return (
                  <div key={swap.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          {shiftDate && (
                            <p className="font-medium text-gray-900">
                              {shiftDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                          )}
                          {shift && (
                            <p className="text-sm text-gray-500">
                              {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)} ({shift.total_hours || shift.duration_hours}h)
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Posted {new Date(swap.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(swap.status)}`}>
                          {swap.status.charAt(0).toUpperCase() + swap.status.slice(1)}
                        </span>
                        {swap.status === 'pending' && (
                          <button
                            onClick={() => handleCancelSwap(swap.id)}
                            disabled={submitting}
                            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
