# Picker Scheduling System

A workforce scheduling and labor optimization system for online order pickers across retail stores.

## Features

- **Demand Forecasting**: Predict order volume by store/hour using historical data
- **Schedule Optimization**: Auto-generate schedules using Google OR-Tools
- **Compliance Engine**: Enforce labor rules (44hr/week, 8hr/day, 6-on-1-off)
- **Manager Portal**: Create, edit, and publish schedules
- **Employee Portal**: View schedules, submit availability, request time off
- **Reporting**: Labor efficiency, coverage scores, compliance metrics

## Tech Stack

- **Backend**: Python + FastAPI
- **Frontend**: Next.js 14 (React)
- **Database**: PostgreSQL
- **Optimizer**: Google OR-Tools
- **Auth**: JWT

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Using Docker (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd picker-scheduler

# Start all services
docker-compose up -d

# Backend API will be available at http://localhost:8000
# Frontend will be available at http://localhost:3000
```

### Local Development

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Start PostgreSQL (via Docker)
docker-compose up -d db

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Project Structure

```
picker-scheduler/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # API endpoints
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   └── core/            # Config, security, database
│   ├── alembic/             # Database migrations
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   ├── components/      # React components
│   │   ├── lib/             # API client, auth
│   │   └── types/           # TypeScript types
│   └── public/
├── data/                    # Sample data
└── docker-compose.yml
```

## API Documentation

Once the backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login and get JWT token |
| `GET /api/stores` | List all stores |
| `GET /api/employees` | List employees |
| `GET /api/schedules` | List schedules |
| `POST /api/schedules` | Create a new schedule |
| `POST /api/schedules/{id}/publish` | Publish a schedule |
| `GET /api/shifts` | List shifts |
| `GET /api/availability/employee/{id}` | Get employee availability |
| `GET /api/reports/labor-summary` | Get labor metrics |
| `POST /api/data/import/employees` | Bulk import employees |
| `POST /api/data/import/historical-orders` | Import historical order data |
| `POST /api/data/import/availability` | Import employee availability |
| `GET /api/data/export/employees` | Export employees to CSV/Excel |
| `GET /api/data/export/schedule/{id}` | Export schedule to CSV/Excel |
| `GET /api/data/export/labor-report` | Export labor report |

## Data Import/Export

The system supports bulk data import and export via CSV or Excel files.

### Import Templates

Download templates from the Data Management page or use these formats:

**Employees Import (`/api/data/import/employees`)**
```csv
first_name,last_name,email,store_code,hire_date,status
John,Doe,john.doe@example.com,DT001,2024-01-15,active
Jane,Smith,jane.smith@example.com,DT001,2024-02-20,active
```

**Historical Orders Import (`/api/data/import/historical-orders`)**
```csv
store_code,date,hour,order_count
DT001,2024-12-01,10,15.5
DT001,2024-12-01,11,22.3
DT001,2024-12-01,12,28.7
```

**Availability Import (`/api/data/import/availability`)**
```csv
employee_email,day_of_week,is_available,preferred_start,preferred_end
john.doe@example.com,0,true,08:00,16:00
john.doe@example.com,1,true,09:00,17:00
john.doe@example.com,6,false,,
```

### Export Options

- **Employees**: Export all employees or filter by store (CSV/Excel)
- **Schedule**: Export a specific schedule with all shifts (CSV/Excel)
- **Labor Report**: Export labor hours by date range with employee summaries (CSV/Excel)

### Using the UI

1. Navigate to **Manager Portal** > **Data**
2. Select **Import Data** or **Export Data** tab
3. Choose the data type and format
4. For imports: Download template, fill in data, upload file
5. For exports: Select options and click Export

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/picker_scheduler` |
| `SECRET_KEY` | JWT secret key | Change in production! |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration | 1440 (24 hours) |

## Labor Rules

The system enforces these compliance rules:

- **Weekly Maximum**: 44 hours per week
- **Daily Maximum**: 8 hours per day
- **Work Pattern**: 6 days on, 1 day off
- **Breaks**: 30 min for 8hr shifts, 1 hr for 9hr shifts

## Database Migrations

```bash
# Create a new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

## Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## License

Proprietary - All rights reserved
