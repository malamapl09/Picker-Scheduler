'use client'

import { useEffect, useState } from 'react'
import { timeOff as timeOffApi, employees as employeesApi } from '@/lib/api'
import { TimeOffRequest, Employee } from '@/types'

interface TimeOffWithEmployee extends TimeOffRequest {
  employee?: Employee
}

export default function TimeOffPage() {
  const [requests, setRequests] = useState<TimeOffWithEmployee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending')
  const [processing, setProcessing] = useState<number | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [requestList, employeeList] = await Promise.all([
        timeOffApi.list(undefined, filter === 'all' ? undefined : filter),
        employeesApi.list(),
      ])

      setEmployees(employeeList)
      const requestsWithEmployees = requestList.map((req: TimeOffRequest) => ({
        ...req,
        employee: employeeList.find((e: Employee) => e.id === req.employee_id),
      }))
      setRequests(requestsWithEmployees)
    } catch (error) {
      console.error('Error loading time-off data:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [filter])

  const handleApprove = async (id: number) => {
    setProcessing(id)
    try {
      await timeOffApi.approve(id)
      await loadData()
    } catch (error) {
      console.error('Error approving request:', error)
      alert('Failed to approve request')
    }
    setProcessing(null)
  }

  const handleDeny = async (id: number) => {
    setProcessing(id)
    try {
      await timeOffApi.deny(id)
      await loadData()
    } catch (error) {
      console.error('Error denying request:', error)
      alert('Failed to deny request')
    }
    setProcessing(null)
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

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Off Requests</h1>
          <p className="text-gray-500">Review and manage PTO requests</p>
        </div>
        <div className="flex items-center gap-2">
          {(['pending', 'approved', 'denied', 'all'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status === 'pending' && pendingCount > 0 && filter !== 'pending' && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No {filter !== 'all' ? filter : ''} time off requests found
          </div>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <div key={request.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-blue-600">
                        {request.employee?.first_name?.[0]}{request.employee?.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {request.employee?.first_name} {request.employee?.last_name}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>
                          {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      {request.reason && (
                        <p className="mt-2 text-sm text-gray-600">
                          "{request.reason}"
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        Submitted {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {request.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDeny(request.id)}
                        disabled={processing === request.id}
                        className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Deny
                      </button>
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={processing === request.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {processing === request.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          'Approve'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
