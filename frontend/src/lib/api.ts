import axios from 'axios'

// Determine API URL based on environment
const getApiUrl = () => {
  // If explicitly set, use that
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }

  // In browser, use same hostname but port 8000
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:8000`
  }

  // Server-side fallback
  return 'http://localhost:8000'
}

const API_URL = getApiUrl()

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        window.location.href = '/(auth)/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth endpoints
export const auth = {
  login: async (email: string, password: string) => {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },
  register: async (data: { email: string; password: string; role?: string }) => {
    const response = await api.post('/auth/register', data)
    return response.data
  },
  me: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },
}

// Store endpoints
export const stores = {
  list: async () => {
    const response = await api.get('/stores')
    return response.data
  },
  get: async (id: number) => {
    const response = await api.get(`/stores/${id}`)
    return response.data
  },
  create: async (data: { name: string; code: string; address?: string; operating_start?: string; operating_end?: string }) => {
    const response = await api.post('/stores', data)
    return response.data
  },
  update: async (id: number, data: { name?: string; address?: string; operating_start?: string; operating_end?: string }) => {
    const response = await api.patch(`/stores/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    await api.delete(`/stores/${id}`)
  },
}

// Employee endpoints
export const employees = {
  list: async (storeId?: number) => {
    const params = storeId ? { store_id: storeId } : {}
    const response = await api.get('/employees', { params })
    return response.data
  },
  get: async (id: number) => {
    const response = await api.get(`/employees/${id}`)
    return response.data
  },
}

// Schedule endpoints
export const schedules = {
  list: async (storeId?: number, status?: string) => {
    const params: any = {}
    if (storeId) params.store_id = storeId
    if (status) params.status = status
    const response = await api.get('/schedules', { params })
    return response.data
  },
  get: async (id: number) => {
    const response = await api.get(`/schedules/${id}`)
    return response.data
  },
  create: async (data: { store_id: number; week_start_date: string }) => {
    const response = await api.post('/schedules', data)
    return response.data
  },
  publish: async (id: number) => {
    const response = await api.post(`/schedules/${id}/publish`)
    return response.data
  },
}

// Shift endpoints
export const shifts = {
  list: async (scheduleId?: number, employeeId?: number) => {
    const params: any = {}
    if (scheduleId) params.schedule_id = scheduleId
    if (employeeId) params.employee_id = employeeId
    const response = await api.get('/shifts', { params })
    return response.data
  },
  create: async (data: {
    schedule_id: number
    employee_id: number
    date: string
    start_time: string
    end_time: string
    break_minutes?: number
  }) => {
    const response = await api.post('/shifts', data)
    return response.data
  },
  update: async (id: number, data: Partial<{
    employee_id: number
    date: string
    start_time: string
    end_time: string
    break_minutes: number
  }>) => {
    const response = await api.patch(`/shifts/${id}`, data)
    return response.data
  },
  delete: async (id: number) => {
    await api.delete(`/shifts/${id}`)
  },
}

// Call-out management endpoints
export const callouts = {
  list: async (storeId?: number, dateFrom?: string, dateTo?: string, includeCovered?: boolean) => {
    const params: any = {}
    if (storeId) params.store_id = storeId
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (includeCovered) params.include_covered = true
    const response = await api.get('/shifts/callouts', { params })
    return response.data
  },
  markCallout: async (shiftId: number, reason?: string) => {
    const response = await api.post(`/shifts/${shiftId}/callout`, { reason })
    return response.data
  },
  findReplacements: async (shiftId: number) => {
    const response = await api.get(`/shifts/${shiftId}/replacements`)
    return response.data
  },
  assignReplacement: async (shiftId: number, replacementEmployeeId: number, force?: boolean) => {
    const response = await api.post(`/shifts/${shiftId}/assign-replacement`,
      { replacement_employee_id: replacementEmployeeId },
      { params: force ? { force: true } : {} }
    )
    return response.data
  },
  revertCallout: async (shiftId: number) => {
    const response = await api.post(`/shifts/${shiftId}/revert-callout`)
    return response.data
  },
}

// Availability endpoints
export const availability = {
  getForEmployee: async (employeeId: number) => {
    const response = await api.get(`/availability/employee/${employeeId}`)
    return response.data
  },
  create: async (data: {
    employee_id: number
    day_of_week: number
    is_available: boolean
    preferred_start?: string
    preferred_end?: string
  }) => {
    const response = await api.post('/availability', data)
    return response.data
  },
}

// Time off endpoints
export const timeOff = {
  list: async (employeeId?: number, status?: string) => {
    const params: any = {}
    if (employeeId) params.employee_id = employeeId
    if (status) params.status = status
    const response = await api.get('/time-off', { params })
    return response.data
  },
  create: async (data: {
    employee_id: number
    start_date: string
    end_date: string
    reason?: string
  }) => {
    const response = await api.post('/time-off', data)
    return response.data
  },
  approve: async (id: number) => {
    const response = await api.patch(`/time-off/${id}`, { status: 'approved' })
    return response.data
  },
  deny: async (id: number) => {
    const response = await api.patch(`/time-off/${id}`, { status: 'denied' })
    return response.data
  },
}

// Reports endpoints
export const reports = {
  laborSummary: async (storeId: number, startDate: string, endDate: string) => {
    const response = await api.get('/reports/labor-summary', {
      params: { store_id: storeId, start_date: startDate, end_date: endDate },
    })
    return response.data
  },
  coverage: async (storeId: number, weekStart: string) => {
    const response = await api.get('/reports/coverage', {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  compliance: async (weekStart: string, storeId?: number) => {
    const params: any = { week_start: weekStart }
    if (storeId) params.store_id = storeId
    const response = await api.get('/reports/compliance', { params })
    return response.data
  },
  utilization: async (storeId: number, weekStart: string) => {
    const response = await api.get('/reports/utilization', {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  laborCost: async (storeId: number, startDate: string, endDate: string, hourlyRate?: number) => {
    const params: any = { store_id: storeId, start_date: startDate, end_date: endDate }
    if (hourlyRate) params.hourly_rate = hourlyRate
    const response = await api.get('/reports/labor-cost', { params })
    return response.data
  },
  efficiency: async (storeId: number, startDate: string, endDate: string) => {
    const response = await api.get('/reports/efficiency', {
      params: { store_id: storeId, start_date: startDate, end_date: endDate },
    })
    return response.data
  },
  trends: async (storeId: number, weeks?: number) => {
    const params: any = { store_id: storeId }
    if (weeks) params.weeks = weeks
    const response = await api.get('/reports/trends', { params })
    return response.data
  },
  storeComparison: async (weekStart: string) => {
    const response = await api.get('/reports/store-comparison', {
      params: { week_start: weekStart },
    })
    return response.data
  },
}

// Optimizer endpoints
export const optimizer = {
  generate: async (data: {
    store_id: number
    week_start: string
    timeout_seconds?: number
    min_coverage_percent?: number
    apply_immediately?: boolean
    locked_shifts?: Array<{
      employee_id: number
      day_index: number
      shift_template_idx: number
      reason?: string
    }>
    manual_overrides?: Array<{
      employee_id: number
      day_index: number
      must_work?: boolean
      cannot_work?: boolean
      reason?: string
    }>
  }) => {
    const response = await api.post('/optimizer/generate', data)
    return response.data
  },
  preview: async (storeId: number, weekStart: string) => {
    const response = await api.post('/optimizer/preview', null, {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  apply: async (storeId: number, weekStart: string, shifts: any[]) => {
    const response = await api.post('/optimizer/apply', shifts, {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  getShiftTemplates: async () => {
    const response = await api.get('/optimizer/shift-templates')
    return response.data
  },
  getCapacity: async (storeId: number, weekStart: string) => {
    const response = await api.get('/optimizer/capacity', {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  fillGaps: async (scheduleId: number) => {
    const response = await api.post('/optimizer/fill-gaps', null, {
      params: { schedule_id: scheduleId },
    })
    return response.data
  },
  getOverrideSummary: async (storeId: number, weekStart: string) => {
    const response = await api.get('/optimizer/override-summary', {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
}

// Forecast endpoints
export const forecasts = {
  generate: async (data: {
    store_id: number
    week_start: string
    method?: string
    save_to_db?: boolean
  }) => {
    const response = await api.post('/forecasts/generate', data)
    return response.data
  },
  getWeek: async (storeId: number, weekStart: string) => {
    const response = await api.get('/forecasts/week', {
      params: { store_id: storeId, week_start: weekStart },
    })
    return response.data
  },
  getDay: async (storeId: number, targetDate: string) => {
    const response = await api.get('/forecasts/day', {
      params: { store_id: storeId, target_date: targetDate },
    })
    return response.data
  },
  getHistoricalSummary: async (storeId: number) => {
    const response = await api.get('/forecasts/historical-summary', {
      params: { store_id: storeId },
    })
    return response.data
  },
  getAccuracy: async (storeId: number, startDate: string, endDate: string) => {
    const response = await api.get('/forecasts/accuracy', {
      params: { store_id: storeId, start_date: startDate, end_date: endDate },
    })
    return response.data
  },
}

// Compliance endpoints
export const compliance = {
  checkShift: async (shiftId: number) => {
    const response = await api.get(`/shifts/${shiftId}/compliance`)
    return response.data
  },
  checkSchedule: async (scheduleId: number) => {
    const response = await api.get(`/schedules/${scheduleId}/compliance`)
    return response.data
  },
  getEmployeeStatus: async (employeeId: number, weekStart: string) => {
    const response = await api.get(`/compliance/employee/${employeeId}`, {
      params: { week_start: weekStart },
    })
    return response.data
  },
}

// Shift Swap endpoints
export const swaps = {
  list: async (employeeId?: number, status?: string) => {
    const params: any = {}
    if (employeeId) params.employee_id = employeeId
    if (status) params.status = status
    const response = await api.get('/swaps', { params })
    return response.data
  },
  getAvailable: async (employeeId: number) => {
    const response = await api.get('/swaps/available', {
      params: { employee_id: employeeId },
    })
    return response.data
  },
  create: async (data: {
    requester_shift_id: number
    requested_shift_id?: number
    notes?: string
  }) => {
    const response = await api.post('/swaps', data)
    return response.data
  },
  accept: async (swapId: number, acceptingShiftId: number) => {
    const response = await api.post(`/swaps/${swapId}/accept`, {
      accepting_shift_id: acceptingShiftId,
    })
    return response.data
  },
  cancel: async (swapId: number) => {
    const response = await api.post(`/swaps/${swapId}/cancel`)
    return response.data
  },
  approve: async (swapId: number) => {
    const response = await api.post(`/swaps/${swapId}/approve`)
    return response.data
  },
  deny: async (swapId: number) => {
    const response = await api.post(`/swaps/${swapId}/deny`)
    return response.data
  },
}

// Notifications endpoints
export const notifications = {
  list: async (unreadOnly?: boolean) => {
    const params: any = {}
    if (unreadOnly) params.unread_only = true
    const response = await api.get('/notifications', { params })
    return response.data
  },
  markRead: async (id: number) => {
    const response = await api.patch(`/notifications/${id}/read`)
    return response.data
  },
  markAllRead: async () => {
    const response = await api.post('/notifications/mark-all-read')
    return response.data
  },
}

// Data Import/Export endpoints
export const dataIO = {
  // Import functions
  importEmployees: async (file: File, storeId: number, createUsers: boolean = true) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/data/import/employees', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { store_id: storeId, create_users: createUsers },
    })
    return response.data
  },
  importHistoricalOrders: async (file: File, storeId: number) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/data/import/historical-orders', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { store_id: storeId },
    })
    return response.data
  },
  importAvailability: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/data/import/availability', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Export functions
  exportEmployees: async (storeId?: number, format: 'csv' | 'xlsx' = 'csv') => {
    const params: any = { format }
    if (storeId) params.store_id = storeId
    const response = await api.get('/data/export/employees', {
      params,
      responseType: 'blob',
    })
    return response
  },
  exportSchedule: async (scheduleId: number, format: 'csv' | 'xlsx' = 'csv') => {
    const response = await api.get(`/data/export/schedule/${scheduleId}`, {
      params: { format },
      responseType: 'blob',
    })
    return response
  },
  exportLaborReport: async (storeId: number, startDate: string, endDate: string, format: 'csv' | 'xlsx' = 'csv') => {
    const response = await api.get('/data/export/labor-report', {
      params: { store_id: storeId, start_date: startDate, end_date: endDate, format },
      responseType: 'blob',
    })
    return response
  },

  // Template downloads
  downloadTemplate: async (templateType: 'employees' | 'historical_orders' | 'availability') => {
    const response = await api.get(`/data/export/template/${templateType}`, {
      responseType: 'blob',
    })
    return response
  },
}
