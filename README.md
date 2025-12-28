# Picker Scheduling System

A workforce scheduling and labor optimization system for online order pickers across retail stores.

## Overview

The Picker Scheduling System automates the creation of work schedules for 50+ employees across 24 retail locations. It replaces manual spreadsheet-based scheduling with a demand-driven system that:

- **Forecasts** order volume by store and hour using historical transaction data
- **Generates** optimized schedules matching staffing to predicted demand
- **Enforces** compliance with labor rules automatically
- **Provides** self-service portals for managers and employees

## Key Features

### For Managers
- **Schedule Optimizer** - Auto-generate schedules using Google OR-Tools
- **Demand Forecasting** - Predict order volume by store/hour
- **Coverage Analysis** - Visualize understaffed/overstaffed periods
- **Call-Out Management** - Quickly find replacement workers
- **Reporting Dashboard** - Labor costs, efficiency, compliance metrics

### For Employees
- **Schedule View** - See upcoming shifts at a glance
- **Availability Management** - Set preferred working hours
- **Time-Off Requests** - Request days off with approval workflow
- **Shift Swaps** - Trade shifts with coworkers

### Compliance Engine
- 44 hours/week maximum
- 8 hours/day maximum
- 6 days on, 1 day off pattern
- Automatic break scheduling

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | Python 3.11+, FastAPI |
| Database | PostgreSQL 14+ |
| Optimizer | Google OR-Tools |
| Auth | JWT (JSON Web Tokens) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-username/picker-scheduler.git
cd picker-scheduler

# Setup Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # Edit with your database URL
alembic upgrade head
uvicorn app.main:app --reload

# Setup Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Access the application:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs

See the [Deployment Guide](docs/deployment.md) for production deployment instructions.

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/api/README.md) | Complete API endpoint documentation |
| [Manager Guide](docs/guides/manager-guide.md) | How to use the manager portal |
| [Employee Guide](docs/guides/employee-guide.md) | How to use the employee portal |
| [Architecture](docs/architecture/README.md) | System design and technical details |
| [Deployment Guide](docs/deployment.md) | Production deployment instructions |
| [AWS Infrastructure](infrastructure/README.md) | Terraform deployment to AWS |

## Project Structure

```
picker-scheduler/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/routes/      # API endpoints
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (optimizer, forecaster)
│   │   └── core/            # Config, security, database
│   ├── alembic/             # Database migrations
│   └── tests/
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/             # Pages (manager/, employee/)
│   │   ├── components/      # Reusable UI components
│   │   ├── lib/             # API client, auth
│   │   └── types/           # TypeScript interfaces
├── infrastructure/          # Terraform AWS deployment
├── docs/                    # Documentation
└── docker-compose.yml
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Authenticate and get JWT token |
| `GET /api/stores` | List all stores |
| `GET /api/employees` | List employees |
| `POST /api/schedules` | Create new schedule |
| `POST /api/optimizer/generate` | Generate optimized schedule |
| `POST /api/forecasts/generate` | Generate demand forecast |
| `GET /api/reports/*` | Access various reports |

Full API documentation available at `/docs` when running the backend.

## Data Import/Export

Bulk import employees, historical orders, and availability via CSV or Excel files.

**Employee Import Format:**
```csv
first_name,last_name,email,store_code,hire_date,status
John,Doe,john@example.com,DT001,2024-01-15,active
```

**Historical Orders Import Format:**
```csv
store_code,date,hour,order_count
DT001,2024-12-01,10,15.5
```

See the Data Management page in the Manager Portal for templates.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SECRET_KEY` | JWT signing key | Required |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration | 1440 (24 hours) |

## Labor Rules

The system enforces these compliance rules:

| Rule | Limit |
|------|-------|
| Weekly Maximum | 44 hours |
| Daily Maximum | 8 hours |
| Minimum Days Off | 1 per week |
| Break (8hr shift) | 30 minutes |
| Break (9hr shift) | 1 hour |

## Development

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Running Tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test
```

## Deployment

### AWS (Recommended)

The system includes Terraform configuration for AWS deployment:
- EC2 instance for application
- RDS PostgreSQL database
- Automated backups
- GitHub Actions auto-deploy

```bash
cd infrastructure
terraform init
terraform apply
```

See [Deployment Guide](docs/deployment.md) for details.

### Cost Estimate (AWS Free Tier)

| Resource | Free Tier |
|----------|-----------|
| EC2 t3.micro | 750 hours/month |
| RDS db.t3.micro | 750 hours/month |
| Storage | 30 GB EBS + 20 GB RDS |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

Proprietary - All rights reserved.

---

For support or questions, contact your system administrator.
