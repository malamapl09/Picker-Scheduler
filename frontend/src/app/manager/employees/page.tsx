'use client'

import { useEffect, useState } from 'react'
import { stores as storesApi, employees as employeesApi, availability as availabilityApi, compliance } from '@/lib/api'
import { Store, Employee, Availability } from '@/types'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface EmployeeWithAvailability extends Employee {
  availability?: Availability[]
  complianceStatus?: {
    total_hours: number
    hours_remaining: number
    days_worked: number
  }
}

export default function EmployeesPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<number | null>(null)
  const [employees, setEmployees] = useState<EmployeeWithAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithAvailability | null>(null)
  const [currentWeek] = useState(formatDate(getMonday(new Date())))

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
    employeesApi.list(selectedStore).then(async (data: Employee[]) => {
      // Fetch availability for each employee
      const employeesWithData = await Promise.all(
        data.map(async (emp) => {
          const [availability, complianceStatus] = await Promise.all([
            availabilityApi.getForEmployee(emp.id).catch(() => []),
            compliance.getEmployeeStatus(emp.id, currentWeek).catch(() => null),
          ])
          return { ...emp, availability, complianceStatus }
        })
      )
      setEmployees(employeesWithData)
      setLoading(false)
    })
  }, [selectedStore, currentWeek])

  const getAvailabilityForDay = (employee: EmployeeWithAvailability, dayIndex: number) => {
    if (!employee.availability) return { available: true }
    const avail = employee.availability.find(a => a.day_of_week === dayIndex)
    return {
      available: avail?.is_available ?? true,
      start: avail?.preferred_start,
      end: avail?.preferred_end,
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500">Manage pickers and their availability</p>
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
        </div>
      </div>

      {/* Employee Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Total Employees</p>
          <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">
            {employees.filter(e => e.status === 'active').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">On Leave</p>
          <p className="text-2xl font-bold text-yellow-600">
            {employees.filter(e => e.status === 'on_leave').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border">
          <p className="text-sm text-gray-500">Inactive</p>
          <p className="text-2xl font-bold text-gray-400">
            {employees.filter(e => e.status === 'inactive').length}
          </p>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Employee Directory</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No employees found for this store
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Employee</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">Hours This Week</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-500" colSpan={7}>
                    Availability
                  </th>
                </tr>
                <tr className="bg-gray-50">
                  <th colSpan={3}></th>
                  {DAY_NAMES.map((day, i) => (
                    <th key={i} className="text-center px-2 py-1 text-xs font-medium text-gray-400">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    onClick={() => setSelectedEmployee(employee)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-600">
                            {employee.first_name[0]}{employee.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{employee.first_name} {employee.last_name}</p>
                          <p className="text-sm text-gray-500">Hired {new Date(employee.hire_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        employee.status === 'active' ? 'bg-green-100 text-green-800' :
                        employee.status === 'on_leave' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {employee.complianceStatus ? (
                        <div>
                          <span className={`font-medium ${
                            employee.complianceStatus.total_hours > 40 ? 'text-orange-600' : 'text-gray-900'
                          }`}>
                            {employee.complianceStatus.total_hours.toFixed(1)}h
                          </span>
                          <span className="text-gray-400"> / 44h</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {DAY_NAMES.map((_, dayIndex) => {
                      const avail = getAvailabilityForDay(employee, dayIndex)
                      return (
                        <td key={dayIndex} className="px-2 py-3 text-center">
                          <div className={`w-6 h-6 mx-auto rounded-full ${
                            avail.available ? 'bg-green-100 border-2 border-green-400' : 'bg-red-100 border-2 border-red-400'
                          }`}></div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold text-blue-600">
                    {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedEmployee.first_name} {selectedEmployee.last_name}
                  </h2>
                  <p className="text-gray-500">Employee ID: {selectedEmployee.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Status</label>
                  <p className="font-medium capitalize">{selectedEmployee.status}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Hire Date</label>
                  <p className="font-medium">{new Date(selectedEmployee.hire_date).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Hours This Week */}
              {selectedEmployee.complianceStatus && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-3">This Week</h3>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {selectedEmployee.complianceStatus.total_hours.toFixed(1)}
                      </p>
                      <p className="text-sm text-gray-500">Hours Worked</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {selectedEmployee.complianceStatus.hours_remaining.toFixed(1)}
                      </p>
                      <p className="text-sm text-gray-500">Hours Remaining</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {selectedEmployee.complianceStatus.days_worked}
                      </p>
                      <p className="text-sm text-gray-500">Days Worked</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Weekly Availability */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Weekly Availability</h3>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_NAMES.map((day, i) => {
                    const avail = getAvailabilityForDay(selectedEmployee, i)
                    return (
                      <div key={i} className={`p-3 text-center rounded-lg ${
                        avail.available ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}>
                        <p className="text-xs font-medium text-gray-600">{day}</p>
                        <p className={`text-lg ${avail.available ? 'text-green-600' : 'text-red-600'}`}>
                          {avail.available ? '✓' : '✗'}
                        </p>
                        {avail.start && (
                          <p className="text-xs text-gray-500 mt-1">
                            {avail.start?.slice(0, 5)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
