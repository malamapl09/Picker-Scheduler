// User types
export type UserRole = 'admin' | 'manager' | 'employee'

export interface User {
  id: number
  email: string
  role: UserRole
  created_at: string
}

// Store types
export interface Store {
  id: number
  name: string
  code: string
  address?: string
  operating_start: string
  operating_end: string
  created_at: string
}

// Employee types
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave'

export interface Employee {
  id: number
  user_id: number
  store_id: number
  first_name: string
  last_name: string
  full_name: string
  hire_date: string
  status: EmployeeStatus
  created_at: string
}

// Schedule types
export type ScheduleStatus = 'draft' | 'published' | 'archived'

export interface Schedule {
  id: number
  store_id: number
  week_start_date: string
  status: ScheduleStatus
  created_by: number
  published_at?: string
  created_at: string
}

export interface ScheduleWithShifts extends Schedule {
  shifts: Shift[]
}

// Shift types
export interface Shift {
  id: number
  schedule_id: number
  employee_id: number
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  duration_hours: number
  total_hours: number
  created_at: string
}

// Availability types
export interface Availability {
  id: number
  employee_id: number
  day_of_week: number
  is_available: boolean
  preferred_start?: string
  preferred_end?: string
  created_at: string
}

// Time off types
export type TimeOffStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface TimeOffRequest {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  reason?: string
  status: TimeOffStatus
  approved_by?: number
  approved_at?: string
  created_at: string
}

// Shift swap types
export type SwapStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface ShiftSwap {
  id: number
  requester_shift_id: number
  requested_shift_id: number
  status: SwapStatus
  approved_by?: number
  approved_at?: string
  created_at: string
}

// Notification types
export type NotificationType =
  | 'schedule_published'
  | 'shift_assigned'
  | 'shift_changed'
  | 'swap_requested'
  | 'swap_approved'
  | 'swap_denied'
  | 'time_off_approved'
  | 'time_off_denied'
  | 'compliance_warning'
  | 'general'

export interface Notification {
  id: number
  user_id: number
  message: string
  type: NotificationType
  is_read: boolean
  created_at: string
}

// Report types
export interface LaborSummary {
  store_id: number
  start_date: string
  end_date: string
  scheduled_hours: number
  forecasted_orders: number
  employee_count: number
  orders_per_hour: number
}

export interface CoverageReport {
  store_id: number
  week_start: string
  coverage_score: number
  understaffed_hours: string[]
  overstaffed_hours: string[]
}

export interface ComplianceReport {
  week_start: string
  store_id?: number
  compliant: boolean
  violations: string[]
  warnings: string[]
}

// Optimizer types
export interface ShiftTemplate {
  id: number
  start_time: string
  end_time: string
  duration_hours: number
  break_minutes: number
  working_hours: number
}

export interface OptimizationResult {
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error'
  message: string
  shifts: GeneratedShift[]
  stats: OptimizationStats
  warnings: string[]
  schedule_id?: number
}

export interface GeneratedShift {
  employee_id: number
  employee_name: string
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  working_hours: number
}

export interface OptimizationStats {
  total_shifts: number
  total_hours: number
  employees_scheduled: number
  total_employees: number
  coverage_percent: number
  total_demand_hours: number
  solve_time_seconds: number
  locked_shifts_count?: number
  manual_overrides_count?: number
}

export interface CapacityInfo {
  store_id: number
  week_start: string
  employee_count: number
  max_hours_per_employee: number
  total_capacity_hours: number
  demand_hours: number
  utilization_needed_percent: number
  feasibility: 'likely' | 'possible' | 'unlikely'
}

// Forecast types
export interface HourlyForecast {
  hour: number
  predicted: number
  confidence_low: number
  confidence_high: number
  data_points: number
}

export interface DailyForecast {
  date: string
  day_name: string
  total_orders: number
  peak_hour: number
  peak_orders: number
  hourly: HourlyForecast[]
}

export interface WeeklyForecast {
  store_id: number
  week_start: string
  total_predicted_orders: number
  total_orders?: number  // Alias used in some API responses
  total_required_hours?: number
  method: string
  daily_forecasts: DailyForecast[]
  warnings: string[]
}

// Coverage types
export interface HourlyCoverage {
  required: number
  scheduled: number
  delta: number
  status: 'adequate' | 'understaffed' | 'overstaffed'
}

export interface CoverageDetail {
  store_id: number
  week_start: string
  coverage_score: number
  total_required_hours: number
  total_scheduled_hours: number
  understaffed_periods: number
  overstaffed_periods: number
  understaffed_hours: Array<{ date: string; hour: number; gap: number }>
  overstaffed_hours: Array<{ date: string; hour: number; excess: number }>
  hourly_breakdown: Record<string, Record<string, HourlyCoverage>>
}

// Extended Shift with employee info
export interface ShiftWithEmployee extends Shift {
  employee?: Employee
}

// Schedule with full details
export interface ScheduleDetail extends Schedule {
  shifts: ShiftWithEmployee[]
  store?: Store
}
