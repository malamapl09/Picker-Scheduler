# API Reference

The Picker Scheduling System provides a RESTful API built with FastAPI. All endpoints are prefixed with `/api`.

## Base URL

- **Development**: `http://localhost:8000/api`
- **Production**: `http://<your-server>:8000/api`

## Interactive Documentation

Once the backend is running, access:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Authentication

The API uses JWT (JSON Web Token) authentication.

### Login

```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=yourpassword
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Using the Token

Include the token in the Authorization header for all protected endpoints:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiration

Tokens expire after 24 hours (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`).

---

## Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Login and get JWT token | No |
| POST | `/auth/register` | Register new user | No |
| GET | `/auth/me` | Get current user info | Yes |

### Stores

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/stores` | List all stores | Yes | Any |
| GET | `/stores/{id}` | Get store by ID | Yes | Any |
| POST | `/stores` | Create new store | Yes | Admin |
| PATCH | `/stores/{id}` | Update store | Yes | Admin |
| DELETE | `/stores/{id}` | Delete store | Yes | Admin |

**Store Object:**
```json
{
  "id": 1,
  "name": "Downtown Store",
  "code": "DT001",
  "address": "123 Main St",
  "operating_start": "08:00:00",
  "operating_end": "22:00:00",
  "created_at": "2024-12-01T10:00:00Z"
}
```

### Employees

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/employees` | List employees | Yes | Manager+ |
| GET | `/employees/{id}` | Get employee by ID | Yes | Manager+ |
| POST | `/employees` | Create employee | Yes | Admin |
| PATCH | `/employees/{id}` | Update employee | Yes | Manager+ |
| DELETE | `/employees/{id}` | Delete employee | Yes | Admin |

**Query Parameters:**
- `store_id` (optional): Filter by store

**Employee Object:**
```json
{
  "id": 1,
  "user_id": 5,
  "store_id": 1,
  "first_name": "John",
  "last_name": "Doe",
  "full_name": "John Doe",
  "hire_date": "2024-01-15",
  "status": "active",
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Schedules

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/schedules` | List schedules | Yes | Manager+ |
| GET | `/schedules/{id}` | Get schedule with shifts | Yes | Manager+ |
| POST | `/schedules` | Create new schedule | Yes | Manager+ |
| POST | `/schedules/{id}/publish` | Publish schedule | Yes | Manager+ |
| DELETE | `/schedules/{id}` | Delete schedule | Yes | Manager+ |

**Query Parameters:**
- `store_id` (optional): Filter by store
- `status` (optional): Filter by status (draft, published, archived)

**Schedule Object:**
```json
{
  "id": 1,
  "store_id": 1,
  "week_start_date": "2024-12-23",
  "status": "published",
  "created_by": 1,
  "published_at": "2024-12-20T14:30:00Z",
  "created_at": "2024-12-19T10:00:00Z"
}
```

### Shifts

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/shifts` | List shifts | Yes | Any |
| GET | `/shifts/{id}` | Get shift by ID | Yes | Any |
| POST | `/shifts` | Create shift | Yes | Manager+ |
| PATCH | `/shifts/{id}` | Update shift | Yes | Manager+ |
| DELETE | `/shifts/{id}` | Delete shift | Yes | Manager+ |
| POST | `/shifts/{id}/callout` | Mark as call-out | Yes | Manager+ |
| GET | `/shifts/{id}/replacements` | Find replacements | Yes | Manager+ |
| POST | `/shifts/{id}/assign-replacement` | Assign replacement | Yes | Manager+ |

**Shift Object:**
```json
{
  "id": 1,
  "schedule_id": 1,
  "employee_id": 5,
  "date": "2024-12-23",
  "start_time": "08:00:00",
  "end_time": "16:00:00",
  "break_minutes": 30,
  "duration_hours": 8.0,
  "total_hours": 7.5,
  "created_at": "2024-12-19T10:00:00Z"
}
```

### Availability

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/availability/employee/{id}` | Get employee availability | Yes |
| POST | `/availability` | Create/update availability | Yes |

**Availability Object:**
```json
{
  "id": 1,
  "employee_id": 5,
  "day_of_week": 0,
  "is_available": true,
  "preferred_start": "08:00:00",
  "preferred_end": "16:00:00",
  "created_at": "2024-12-01T10:00:00Z"
}
```

**Note:** `day_of_week` is 0-6 where 0=Monday, 6=Sunday.

### Time Off

| Method | Endpoint | Description | Auth Required | Role |
|--------|----------|-------------|---------------|------|
| GET | `/time-off` | List time-off requests | Yes | Any |
| POST | `/time-off` | Create request | Yes | Any |
| PATCH | `/time-off/{id}` | Update status | Yes | Manager+ |

**Query Parameters:**
- `employee_id` (optional): Filter by employee
- `status` (optional): Filter by status (pending, approved, denied, cancelled)

**Time Off Object:**
```json
{
  "id": 1,
  "employee_id": 5,
  "start_date": "2024-12-25",
  "end_date": "2024-12-26",
  "reason": "Christmas holiday",
  "status": "approved",
  "approved_by": 1,
  "approved_at": "2024-12-20T14:30:00Z",
  "created_at": "2024-12-15T10:00:00Z"
}
```

### Shift Swaps

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/swaps` | List swap requests | Yes |
| GET | `/swaps/available` | Get available shifts for swap | Yes |
| POST | `/swaps` | Create swap request | Yes |
| POST | `/swaps/{id}/accept` | Accept a swap | Yes |
| POST | `/swaps/{id}/approve` | Approve swap (manager) | Yes |
| POST | `/swaps/{id}/deny` | Deny swap (manager) | Yes |
| POST | `/swaps/{id}/cancel` | Cancel swap request | Yes |

### Forecasts

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/forecasts/generate` | Generate forecast | Yes |
| GET | `/forecasts/week` | Get weekly forecast | Yes |
| GET | `/forecasts/day` | Get daily forecast | Yes |
| GET | `/forecasts/historical-summary` | Get historical data summary | Yes |
| GET | `/forecasts/accuracy` | Check forecast accuracy | Yes |

**Generate Forecast Request:**
```json
{
  "store_id": 1,
  "week_start": "2024-12-23",
  "method": "time_series",
  "save_to_db": true
}
```

**Weekly Forecast Response:**
```json
{
  "store_id": 1,
  "week_start": "2024-12-23",
  "total_predicted_orders": 1250,
  "total_picker_hours": 125,
  "method": "time_series",
  "daily_forecasts": [
    {
      "date": "2024-12-23",
      "day_name": "Monday",
      "total_orders": 180,
      "peak_hour": 12,
      "peak_orders": 25,
      "hourly": [...]
    }
  ],
  "warnings": []
}
```

### Schedule Optimizer

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/optimizer/generate` | Generate optimized schedule | Yes |
| POST | `/optimizer/preview` | Preview optimization | Yes |
| POST | `/optimizer/apply` | Apply generated shifts | Yes |
| GET | `/optimizer/shift-templates` | Get shift templates | Yes |
| GET | `/optimizer/capacity` | Check scheduling capacity | Yes |
| POST | `/optimizer/fill-gaps` | Auto-fill coverage gaps | Yes |

**Generate Request:**
```json
{
  "store_id": 1,
  "week_start": "2024-12-23",
  "timeout_seconds": 30,
  "min_coverage_percent": 80,
  "locked_shifts": [],
  "manual_overrides": []
}
```

**Optimization Result:**
```json
{
  "status": "optimal",
  "message": "Schedule generated successfully",
  "shifts": [...],
  "stats": {
    "total_shifts": 42,
    "total_hours": 294,
    "employees_scheduled": 7,
    "total_employees": 8,
    "coverage_percent": 95.5,
    "solve_time_seconds": 2.3
  },
  "warnings": [],
  "compliance_issues": []
}
```

### Reports

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/reports/labor-summary` | Labor hours summary | Yes |
| GET | `/reports/coverage` | Coverage analysis | Yes |
| GET | `/reports/compliance` | Compliance report | Yes |
| GET | `/reports/utilization` | Employee utilization | Yes |
| GET | `/reports/labor-cost` | Labor cost breakdown | Yes |
| GET | `/reports/efficiency` | Efficiency metrics | Yes |
| GET | `/reports/trends` | Historical trends | Yes |
| GET | `/reports/store-comparison` | Compare stores | Yes |

### Data Import/Export

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/data/import/employees` | Import employees (CSV/Excel) | Yes |
| POST | `/data/import/historical-orders` | Import order history | Yes |
| POST | `/data/import/availability` | Import availability | Yes |
| GET | `/data/export/employees` | Export employees | Yes |
| GET | `/data/export/schedule/{id}` | Export schedule | Yes |
| GET | `/data/export/labor-report` | Export labor report | Yes |
| GET | `/data/export/template/{type}` | Download import template | Yes |

### Notifications

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/notifications` | List notifications | Yes |
| PATCH | `/notifications/{id}/read` | Mark as read | Yes |
| POST | `/notifications/mark-all-read` | Mark all as read | Yes |

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 422 | Unprocessable Entity (validation error) |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production deployments, consider adding rate limiting at the reverse proxy level (nginx, AWS ALB, etc.).

---

## Pagination

List endpoints support pagination via query parameters:

- `skip` (default: 0): Number of records to skip
- `limit` (default: 100): Maximum records to return

Example: `/api/employees?skip=20&limit=10`
