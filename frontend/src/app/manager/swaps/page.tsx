'use client'

import { useEffect, useState } from 'react'
import { swaps as swapsApi, stores as storesApi } from '@/lib/api'
import { Store } from '@/types'

interface ShiftInfo {
  id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  employee?: {
    id: number
    first_name: string
    last_name: string
  }
}

interface SwapRequest {
  id: number
  requester_shift_id: number
  requested_shift_id: number | null
  status: 'pending' | 'accepted' | 'approved' | 'denied' | 'cancelled'
  notes?: string
  created_at: string
  requester_shift?: ShiftInfo
  requested_shift?: ShiftInfo
}

export default function SwapApprovalsPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<number | null>(null)
  const [filter, setFilter] = useState<'accepted' | 'pending' | 'all'>('accepted')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    storesApi.list().then(data => {
      setStores(data)
      if (data.length > 0) {
        setSelectedStore(data[0].id)
      }
    })
  }, [])

  const loadSwaps = async () => {
    setLoading(true)
    try {
      const statusFilter = filter === 'all' ? undefined : filter
      const data = await swapsApi.list(undefined, statusFilter)
      setSwapRequests(data)
    } catch (error) {
      console.error('Error loading swaps:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadSwaps()
  }, [filter])

  const handleApprove = async (swapId: number) => {
    setProcessing(swapId)
    setMessage(null)
    try {
      await swapsApi.approve(swapId)
      await loadSwaps()
      setMessage({ type: 'success', text: 'Swap approved successfully! Shifts have been exchanged.' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to approve swap'
      })
    }
    setProcessing(null)
  }

  const handleDeny = async (swapId: number) => {
    setProcessing(swapId)
    setMessage(null)
    try {
      await swapsApi.deny(swapId)
      await loadSwaps()
      setMessage({ type: 'success', text: 'Swap request denied.' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to deny swap'
      })
    }
    setProcessing(null)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'accepted': return 'bg-blue-100 text-blue-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'denied': return 'bg-red-100 text-red-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatShiftInfo = (shift?: ShiftInfo) => {
    if (!shift) return 'N/A'
    const date = new Date(shift.date)
    return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${shift.start_time.slice(0, 5)}-${shift.end_time.slice(0, 5)}`
  }

  const acceptedCount = swapRequests.filter(s => s.status === 'accepted').length
  const pendingCount = swapRequests.filter(s => s.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Swap Approvals</h1>
          <p className="text-gray-500">Review and approve employee shift swap requests</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedStore || ''}
            onChange={(e) => setSelectedStore(Number(e.target.value))}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Awaiting Approval</p>
          <p className="text-2xl font-bold text-blue-600">{acceptedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Ready for manager review</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Open Requests</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
          <p className="text-xs text-gray-400 mt-1">Waiting for acceptance</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Total This Week</p>
          <p className="text-2xl font-bold text-gray-900">{swapRequests.length}</p>
          <p className="text-xs text-gray-400 mt-1">All swap requests</p>
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

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFilter('accepted')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'accepted'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Needs Approval ({acceptedCount})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Open Requests ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            filter === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All Requests
        </button>
      </div>

      {/* Swap Requests List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : swapRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p>No swap requests found</p>
          </div>
        ) : (
          <div className="divide-y">
            {swapRequests.map((swap) => (
              <div key={swap.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Swap Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(swap.status)}`}>
                        {swap.status.charAt(0).toUpperCase() + swap.status.slice(1)}
                      </span>
                      <span className="text-sm text-gray-500">
                        Requested {new Date(swap.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Swap Visualization */}
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Requester's Shift */}
                      <div className="flex-1 p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Giving Up</p>
                        <p className="font-semibold text-gray-900">
                          {swap.requester_shift?.employee?.first_name} {swap.requester_shift?.employee?.last_name}
                        </p>
                        <p className="text-sm text-gray-600">
                          {formatShiftInfo(swap.requester_shift)}
                        </p>
                      </div>

                      {/* Arrow */}
                      <div className="flex justify-center md:flex-shrink-0">
                        <svg className="w-8 h-8 text-gray-400 rotate-90 md:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>

                      {/* Requested Shift */}
                      <div className="flex-1 p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Receiving</p>
                        {swap.requested_shift ? (
                          <>
                            <p className="font-semibold text-gray-900">
                              {swap.requested_shift?.employee?.first_name} {swap.requested_shift?.employee?.last_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatShiftInfo(swap.requested_shift)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Open request - waiting for acceptance</p>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {swap.notes && (
                      <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <span className="font-medium">Note:</span> {swap.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {swap.status === 'accepted' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDeny(swap.id)}
                        disabled={processing === swap.id}
                        className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Deny
                      </button>
                      <button
                        onClick={() => handleApprove(swap.id)}
                        disabled={processing === swap.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {processing === swap.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        Approve
                      </button>
                    </div>
                  )}

                  {swap.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-gray-500 italic">Awaiting employee acceptance</span>
                    </div>
                  )}

                  {swap.status === 'approved' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Completed
                      </span>
                    </div>
                  )}

                  {swap.status === 'denied' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-red-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Denied
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-2">How Shift Swaps Work</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>An employee posts their shift for swap (status: <span className="font-medium">Pending</span>)</li>
          <li>Another employee accepts by offering their shift in exchange (status: <span className="font-medium">Accepted</span>)</li>
          <li>Manager reviews and approves or denies the swap</li>
          <li>If approved, the system automatically exchanges the shifts between employees</li>
        </ol>
      </div>
    </div>
  )
}
