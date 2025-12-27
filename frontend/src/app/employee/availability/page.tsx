'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { availability as availabilityApi, employees as employeesApi } from '@/lib/api'
import { Availability, Employee } from '@/types'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const hour = i + 6
  return `${hour.toString().padStart(2, '0')}:00`
})

interface DayAvailability {
  dayIndex: number
  isAvailable: boolean
  preferredStart: string
  preferredEnd: string
}

export default function AvailabilityPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [availability, setAvailability] = useState<DayAvailability[]>(
    DAY_NAMES.map((_, i) => ({
      dayIndex: i,
      isAvailable: true,
      preferredStart: '08:00',
      preferredEnd: '18:00',
    }))
  )
  const [hasChanges, setHasChanges] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!user) return

    const loadData = async () => {
      setLoading(true)
      try {
        const employees = await employeesApi.list()
        const currentEmployee = employees.find((e: Employee) => e.user_id === user.id)

        if (currentEmployee) {
          setEmployee(currentEmployee)

          const existingAvailability = await availabilityApi.getForEmployee(currentEmployee.id)

          if (existingAvailability.length > 0) {
            setAvailability(prev =>
              prev.map(day => {
                const existing = existingAvailability.find((a: Availability) => a.day_of_week === day.dayIndex)
                if (existing) {
                  return {
                    ...day,
                    isAvailable: existing.is_available,
                    preferredStart: existing.preferred_start?.slice(0, 5) || '08:00',
                    preferredEnd: existing.preferred_end?.slice(0, 5) || '18:00',
                  }
                }
                return day
              })
            )
          }
        }
      } catch (error) {
        console.error('Error loading availability:', error)
      }
      setLoading(false)
    }

    loadData()
  }, [user])

  const updateDay = (dayIndex: number, updates: Partial<DayAvailability>) => {
    setAvailability(prev =>
      prev.map(day =>
        day.dayIndex === dayIndex ? { ...day, ...updates } : day
      )
    )
    setHasChanges(true)
    setMessage(null)
  }

  const saveAvailability = async () => {
    if (!employee) return

    setSaving(true)
    setMessage(null)

    try {
      for (const day of availability) {
        await availabilityApi.create({
          employee_id: employee.id,
          day_of_week: day.dayIndex,
          is_available: day.isAvailable,
          preferred_start: day.preferredStart,
          preferred_end: day.preferredEnd,
        })
      }

      setHasChanges(false)
      setMessage({ type: 'success', text: 'Availability saved successfully!' })
    } catch (error) {
      console.error('Error saving availability:', error)
      setMessage({ type: 'error', text: 'Failed to save availability. Please try again.' })
    }

    setSaving(false)
  }

  const setAllAvailable = () => {
    setAvailability(prev =>
      prev.map(day => ({ ...day, isAvailable: true }))
    )
    setHasChanges(true)
    setMessage(null)
  }

  const setWeekdaysOnly = () => {
    setAvailability(prev =>
      prev.map(day => ({
        ...day,
        isAvailable: day.dayIndex < 5, // Mon-Fri
      }))
    )
    setHasChanges(true)
    setMessage(null)
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
          <h1 className="text-2xl font-bold text-gray-900">My Availability</h1>
          <p className="text-gray-500">Set your weekly availability preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={setWeekdaysOnly}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Weekdays Only
          </button>
          <button
            onClick={setAllAvailable}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            All Days
          </button>
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

      {/* Availability Grid */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <p className="text-sm text-gray-600">
            Toggle each day on/off and set your preferred working hours. Your manager will use this
            when creating schedules.
          </p>
        </div>
        <div className="divide-y">
          {availability.map((day) => (
            <div key={day.dayIndex} className={`p-4 ${!day.isAvailable ? 'bg-gray-50' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Day Name & Toggle */}
                <div className="flex items-center gap-4 sm:w-48">
                  <button
                    onClick={() => updateDay(day.dayIndex, { isAvailable: !day.isAvailable })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      day.isAvailable ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      day.isAvailable ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  </button>
                  <span className={`font-medium ${day.isAvailable ? 'text-gray-900' : 'text-gray-400'}`}>
                    {DAY_NAMES[day.dayIndex]}
                  </span>
                </div>

                {/* Time Range */}
                {day.isAvailable && (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-500">From</label>
                      <select
                        value={day.preferredStart}
                        onChange={(e) => updateDay(day.dayIndex, { preferredStart: e.target.value })}
                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {TIME_SLOTS.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-500">To</label>
                      <select
                        value={day.preferredEnd}
                        onChange={(e) => updateDay(day.dayIndex, { preferredEnd: e.target.value })}
                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        {TIME_SLOTS.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-sm text-gray-400 hidden sm:inline">
                      ({parseInt(day.preferredEnd) - parseInt(day.preferredStart)}h available)
                    </span>
                  </div>
                )}

                {!day.isAvailable && (
                  <span className="text-sm text-gray-400">Not available</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Availability Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {availability.filter(d => d.isAvailable).length}
            </p>
            <p className="text-sm text-gray-500">Days Available</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {availability.filter(d => !d.isAvailable).length}
            </p>
            <p className="text-sm text-gray-500">Days Unavailable</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {availability
                .filter(d => d.isAvailable)
                .reduce((sum, d) => sum + (parseInt(d.preferredEnd) - parseInt(d.preferredStart)), 0)}h
            </p>
            <p className="text-sm text-gray-500">Max Weekly Hours</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">
              {availability.filter(d => d.isAvailable && d.dayIndex >= 5).length}
            </p>
            <p className="text-sm text-gray-500">Weekend Days</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveAvailability}
          disabled={saving || !hasChanges}
          className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            hasChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
          {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
        </button>
      </div>
    </div>
  )
}
