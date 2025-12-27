'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { timeOff as timeOffApi, employees as employeesApi } from '@/lib/api'
import { TimeOffRequest, Employee } from '@/types'

export default function TimeOffRequestsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [requests, setRequests] = useState<TimeOffRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadRequests = async (employeeId: number) => {
    try {
      const data = await timeOffApi.list(employeeId)
      setRequests(data.sort((a: TimeOffRequest, b: TimeOffRequest) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
    } catch (error) {
      console.error('Error loading requests:', error)
    }
  }

  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      setLoading(true)
      try {
        const employees = await employeesApi.list()
        const currentEmployee = employees.find((e: Employee) => e.user_id === user.id)

        if (currentEmployee) {
          setEmployee(currentEmployee)
          await loadRequests(currentEmployee.id)
        }
      } catch (error) {
        console.error('Error loading data:', error)
      }
      setLoading(false)
    }

    loadData()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employee) return

    setSubmitting(true)
    setMessage(null)

    try {
      await timeOffApi.create({
        employee_id: employee.id,
        start_date: formData.startDate,
        end_date: formData.endDate,
        reason: formData.reason || undefined,
      })

      await loadRequests(employee.id)
      setShowForm(false)
      setFormData({ startDate: '', endDate: '', reason: '' })
      setMessage({ type: 'success', text: 'Time off request submitted successfully!' })
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to submit request. Please try again.',
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

  const getDaysCount = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const approvedCount = requests.filter(r => r.status === 'approved').length

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
          <h1 className="text-2xl font-bold text-gray-900">Time Off Requests</h1>
          <p className="text-gray-500">Request and track your time off</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Approved</p>
          <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
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

      {/* New Request Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">New Time Off Request</h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.startDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                placeholder="e.g., Vacation, Personal appointment, Family event..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {formData.startDate && formData.endDate && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Requesting {getDaysCount(formData.startDate, formData.endDate)} day(s) off
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Requests List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Your Requests</h2>
        </div>

        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p>No time off requests yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
            >
              Create your first request
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <div key={request.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {new Date(request.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        {request.start_date !== request.end_date && (
                          <> - {new Date(request.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        {getDaysCount(request.start_date, request.end_date)} day(s)
                        {request.reason && ` - ${request.reason}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(request.status)}`}>
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
