# System Architecture

This document describes the technical architecture of the Picker Scheduling System.

## Overview

The system follows a modern three-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client Layer                               │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Next.js Frontend                            ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ ││
│  │  │ Manager     │  │ Employee    │  │ Shared Components       │ ││
│  │  │ Portal      │  │ Portal      │  │ (Calendar, Forms, UI)   │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP/REST (JSON)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    FastAPI Backend                              ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐││
│  │  │ Auth     │  │ Routes   │  │ Services │  │ OR-Tools         │││
│  │  │ (JWT)    │  │ (CRUD)   │  │ (Logic)  │  │ Optimizer        │││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ SQLAlchemy ORM
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      PostgreSQL                                 ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐││
│  │  │ Users    │  │ Stores   │  │ Schedules│  │ Forecasts        │││
│  │  │ Employees│  │ Shifts   │  │ TimeOff  │  │ Historical Data  │││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js | 14.x | React framework with SSR |
| Frontend | TypeScript | 5.x | Type-safe JavaScript |
| Frontend | Tailwind CSS | 3.x | Utility-first styling |
| Backend | Python | 3.11+ | Primary language |
| Backend | FastAPI | 0.100+ | REST API framework |
| Backend | SQLAlchemy | 2.x | ORM |
| Backend | Alembic | 1.x | Database migrations |
| Backend | OR-Tools | 9.x | Schedule optimization |
| Database | PostgreSQL | 14+ | Primary database |
| Auth | JWT | - | Token-based authentication |

---

## Directory Structure

```
picker-scheduler/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Configuration settings
│   │   ├── api/
│   │   │   ├── routes/          # API endpoint handlers
│   │   │   │   ├── auth.py
│   │   │   │   ├── stores.py
│   │   │   │   ├── employees.py
│   │   │   │   ├── schedules.py
│   │   │   │   ├── shifts.py
│   │   │   │   ├── availability.py
│   │   │   │   ├── time_off.py
│   │   │   │   ├── swaps.py
│   │   │   │   ├── reports.py
│   │   │   │   ├── compliance.py
│   │   │   │   ├── optimizer.py
│   │   │   │   ├── forecasts.py
│   │   │   │   ├── notifications.py
│   │   │   │   └── data_io.py
│   │   │   └── deps.py          # Dependency injection
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Business logic
│   │   │   ├── optimizer.py     # OR-Tools scheduling
│   │   │   ├── compliance.py    # Labor rule validation
│   │   │   ├── forecaster.py    # Demand prediction
│   │   │   └── labor_standards.py
│   │   └── core/
│   │       ├── security.py      # JWT, password hashing
│   │       └── database.py      # DB session management
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # Backend tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── (auth)/          # Auth pages (login)
│   │   │   ├── manager/         # Manager portal
│   │   │   │   ├── stores/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── schedules/
│   │   │   │   ├── employees/
│   │   │   │   ├── callouts/
│   │   │   │   ├── time-off/
│   │   │   │   ├── swaps/
│   │   │   │   ├── reports/
│   │   │   │   └── data/
│   │   │   └── employee/        # Employee portal
│   │   │       ├── schedule/
│   │   │       ├── availability/
│   │   │       ├── requests/
│   │   │       └── swaps/
│   │   ├── components/          # Reusable React components
│   │   ├── lib/
│   │   │   ├── api.ts           # API client (axios)
│   │   │   └── auth.ts          # Auth state (zustand)
│   │   └── types/               # TypeScript interfaces
│   └── package.json
├── infrastructure/              # Terraform & deployment
├── docs/                        # Documentation
└── docker-compose.yml
```

---

## Database Schema

### Core Entities

```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    users      │       │    stores     │       │   employees   │
├───────────────┤       ├───────────────┤       ├───────────────┤
│ id            │       │ id            │       │ id            │
│ email         │       │ name          │       │ user_id      ─┼──► users
│ password_hash │       │ code          │       │ store_id     ─┼──► stores
│ role          │       │ address       │       │ first_name    │
│ created_at    │       │ operating_*   │       │ last_name     │
└───────────────┘       │ created_at    │       │ hire_date     │
                        └───────────────┘       │ status        │
                                                │ created_at    │
                                                └───────────────┘
```

### Scheduling Entities

```
┌───────────────┐       ┌───────────────┐
│   schedules   │       │    shifts     │
├───────────────┤       ├───────────────┤
│ id            │       │ id            │
│ store_id     ─┼──►    │ schedule_id  ─┼──► schedules
│ week_start    │       │ employee_id  ─┼──► employees
│ status        │       │ date          │
│ created_by   ─┼──►    │ start_time    │
│ published_at  │       │ end_time      │
│ created_at    │       │ break_minutes │
└───────────────┘       │ created_at    │
                        └───────────────┘
```

### Employee Management

```
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│   availability     │   │  time_off_requests │   │    shift_swaps     │
├────────────────────┤   ├────────────────────┤   ├────────────────────┤
│ id                 │   │ id                 │   │ id                 │
│ employee_id       ─┼─► │ employee_id       ─┼─► │ requester_shift   ─┼─►
│ day_of_week        │   │ start_date         │   │ requested_shift   ─┼─►
│ is_available       │   │ end_date           │   │ status             │
│ preferred_start    │   │ reason             │   │ approved_by       ─┼─►
│ preferred_end      │   │ status             │   │ approved_at        │
│ created_at         │   │ approved_by       ─┼─► │ created_at         │
└────────────────────┘   │ approved_at        │   └────────────────────┘
                         │ created_at         │
                         └────────────────────┘
```

### Forecasting

```
┌────────────────────┐   ┌────────────────────┐
│  historical_orders │   │   order_forecasts  │
├────────────────────┤   ├────────────────────┤
│ id                 │   │ id                 │
│ store_id          ─┼─► │ store_id          ─┼─►
│ date               │   │ date               │
│ hour               │   │ hour               │
│ order_count        │   │ predicted_orders   │
│ created_at         │   │ created_at         │
└────────────────────┘   └────────────────────┘
```

---

## Key Components

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  FastAPI │     │ Security │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /login    │                │                │
     │ (email, pass)  │                │                │
     ├───────────────►│                │                │
     │                │ verify_password│                │
     │                ├───────────────►│                │
     │                │                │ query user     │
     │                │                ├───────────────►│
     │                │                │◄───────────────┤
     │                │◄───────────────┤                │
     │                │ create_token   │                │
     │                ├───────────────►│                │
     │                │◄───────────────┤                │
     │ {access_token} │                │                │
     │◄───────────────┤                │                │
     │                │                │                │
     │ GET /api/*     │                │                │
     │ Bearer token   │                │                │
     ├───────────────►│                │                │
     │                │ verify_token   │                │
     │                ├───────────────►│                │
     │                │◄───────────────┤                │
     │ response       │                │                │
     │◄───────────────┤                │                │
```

### Schedule Optimization

The optimizer uses Google OR-Tools CP-SAT solver:

```python
# Simplified optimization model

# Decision variables: X[e,d,s] = 1 if employee e works shift s on day d
X = {}
for employee in employees:
    for day in days:
        for shift in shift_templates:
            X[employee, day, shift] = model.NewBoolVar(f'x_{e}_{d}_{s}')

# Constraints:
# 1. Each employee works at most one shift per day
# 2. Weekly hours <= 44
# 3. At least one day off per week
# 4. Match employee availability
# 5. Meet coverage requirements

# Objective: Minimize understaffing + overstaffing costs
```

**Optimization Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeout_seconds` | 30 | Max solve time |
| `min_coverage_percent` | 80 | Minimum coverage target |
| `locked_shifts` | [] | Shifts that can't be moved |
| `manual_overrides` | [] | Force-include/exclude employees |

### Forecasting Engine

The forecaster predicts hourly order volume:

```
Historical Data                    Prediction
      │                                │
      ▼                                ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 4 weeks of  │    │ Time Series │    │ Predicted   │
│ order data  │───►│ Analysis    │───►│ orders/hour │
│ by hour     │    │ (patterns)  │    │ for week    │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Day-of-week │
                   │ Hour-of-day │
                   │ Seasonality │
                   └─────────────┘
```

**Forecasting Methods:**

1. **Simple Average** - Mean of same day/hour over history
2. **Weighted Average** - Recent weeks weighted higher
3. **Time Series** - Moving average with trend adjustment

### Compliance Engine

Validates schedules against labor rules:

```python
class ComplianceChecker:
    MAX_WEEKLY_HOURS = 44
    MAX_DAILY_HOURS = 8
    MIN_DAYS_OFF = 1  # per week

    def check_employee_week(self, employee_id, shifts):
        violations = []

        # Check weekly hours
        total_hours = sum(s.total_hours for s in shifts)
        if total_hours > self.MAX_WEEKLY_HOURS:
            violations.append(f"Weekly hours ({total_hours}) exceeds {self.MAX_WEEKLY_HOURS}")

        # Check daily hours
        for date, day_shifts in group_by_date(shifts):
            day_hours = sum(s.total_hours for s in day_shifts)
            if day_hours > self.MAX_DAILY_HOURS:
                violations.append(f"Daily hours on {date} exceeds {self.MAX_DAILY_HOURS}")

        # Check days off
        days_worked = len(set(s.date for s in shifts))
        if days_worked > 6:
            violations.append("No day off scheduled")

        return violations
```

---

## API Design

### RESTful Conventions

| Operation | HTTP Method | URL Pattern | Example |
|-----------|-------------|-------------|---------|
| List | GET | `/resources` | GET /api/stores |
| Create | POST | `/resources` | POST /api/stores |
| Read | GET | `/resources/{id}` | GET /api/stores/1 |
| Update | PATCH | `/resources/{id}` | PATCH /api/stores/1 |
| Delete | DELETE | `/resources/{id}` | DELETE /api/stores/1 |
| Action | POST | `/resources/{id}/action` | POST /api/schedules/1/publish |

### Request/Response Patterns

**Pydantic Schemas:**
```python
# Request schema
class StoreCreate(BaseModel):
    name: str
    code: str
    address: Optional[str] = None

# Response schema
class StoreResponse(StoreBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
```

### Error Handling

```python
# Standard error response
{
    "detail": "Store not found"
}

# Validation error
{
    "detail": [
        {
            "loc": ["body", "name"],
            "msg": "field required",
            "type": "value_error.missing"
        }
    ]
}
```

---

## Security

### Authentication

- **JWT tokens** with configurable expiration
- **Password hashing** using bcrypt
- **Role-based access control** (admin, manager, employee)

### Authorization Levels

| Role | Capabilities |
|------|--------------|
| Admin | Full access to all stores and features |
| Manager | Manage schedules, employees, approve requests |
| Employee | View own schedule, submit availability/requests |

### Security Best Practices

1. **HTTPS** - Always use TLS in production
2. **CORS** - Configure allowed origins appropriately
3. **SQL Injection** - Prevented by SQLAlchemy ORM
4. **Password Policy** - Enforce strong passwords
5. **Token Storage** - Use httpOnly cookies in production

---

## Performance Considerations

### Database

- **Indexes** on frequently queried columns (store_id, employee_id, date)
- **Connection pooling** via SQLAlchemy
- **Query optimization** - Avoid N+1 queries

### Caching (Future)

- Redis for session storage
- API response caching
- Forecast result caching

### Optimization

- OR-Tools solver timeout prevents long waits
- Pagination on list endpoints
- Lazy loading of related entities

---

## Deployment Architecture

### AWS Deployment

```
                    ┌─────────────────┐
                    │    Internet     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  EC2 Instance   │
                    │  (t3.small)     │
                    │                 │
                    │ ┌─────────────┐ │
                    │ │ Next.js     │ │
                    │ │ :3000       │ │
                    │ ├─────────────┤ │
                    │ │ FastAPI     │ │
                    │ │ :8000       │ │
                    │ └─────────────┘ │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  RDS PostgreSQL │
                    │  (db.t3.micro)  │
                    └─────────────────┘
```

### Systemd Services

```
picker-backend.service   → uvicorn (FastAPI)
picker-frontend.service  → next start (Next.js)
```

### CI/CD

GitHub Actions workflow:
1. Push to main branch
2. SSH to EC2 instance
3. Pull latest code
4. Install dependencies
5. Run migrations
6. Rebuild frontend
7. Restart services

---

## Monitoring & Logging

### Application Logs

- Backend: Python logging to stdout
- Frontend: Next.js console output
- Access logs: uvicorn access logs

### Viewing Logs

```bash
# Backend logs
sudo journalctl -u picker-backend -f

# Frontend logs
sudo journalctl -u picker-frontend -f
```

### Health Checks

- `GET /health` - Backend health check
- `GET /` - API root response

---

## Development Workflow

### Local Setup

1. Start PostgreSQL via Docker
2. Run backend with `uvicorn app.main:app --reload`
3. Run frontend with `npm run dev`

### Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing

```bash
# Backend tests
cd backend && pytest

# Frontend tests
cd frontend && npm test
```

---

## Future Enhancements

### Planned Features

1. **Mobile App** - React Native or Flutter
2. **Email Notifications** - SendGrid/SES integration
3. **Time Clock Integration** - Import actual hours worked
4. **Advanced Forecasting** - ML models with more features
5. **Multi-tenant** - Support multiple organizations

### Scalability Path

1. **Load Balancing** - Multiple EC2 instances behind ALB
2. **Read Replicas** - PostgreSQL read replicas for reports
3. **Caching** - Redis for session and API caching
4. **Background Jobs** - Celery for async tasks
