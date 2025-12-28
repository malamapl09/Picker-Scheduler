# Deployment Guide

This guide covers deploying the Picker Scheduling System to production environments.

## Deployment Options

1. **AWS (Recommended)** - EC2 + RDS using Terraform
2. **Docker Compose** - Self-hosted on any server
3. **Local Development** - For testing and development

---

## AWS Deployment (Terraform)

### Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured (`aws configure`)
- Terraform installed (v1.0+)
- SSH key pair for EC2 access

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AWS Cloud                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Default VPC                         │  │
│  │                                                        │  │
│  │   ┌─────────────────────┐    ┌──────────────────────┐ │  │
│  │   │   EC2 (t3.small)    │    │   RDS PostgreSQL     │ │  │
│  │   │                     │    │   (db.t3.micro)      │ │  │
│  │   │  ┌───────────────┐  │    │                      │ │  │
│  │   │  │ Next.js :3000 │  │───►│  picker_scheduler    │ │  │
│  │   │  ├───────────────┤  │    │  :5432               │ │  │
│  │   │  │ FastAPI :8000 │  │    │                      │ │  │
│  │   │  └───────────────┘  │    │  Automated backups   │ │  │
│  │   │                     │    └──────────────────────┘ │  │
│  │   │  systemd services   │                              │  │
│  │   └─────────────────────┘                              │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Cost Estimate

| Resource | Free Tier | After Free Tier |
|----------|-----------|-----------------|
| EC2 t3.small | 750 hrs/month (t3.micro) | ~$15/month |
| RDS db.t3.micro | 750 hrs/month | ~$15/month |
| EBS Storage | 30 GB free | ~$3/month per 30GB |
| Data Transfer | 100 GB free | ~$0.09/GB |

### Step 1: Create SSH Key Pair

```bash
# Create key pair
aws ec2 create-key-pair \
  --key-name picker-scheduler-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/picker-scheduler-key.pem

# Set permissions
chmod 400 ~/.ssh/picker-scheduler-key.pem
```

### Step 2: Configure Terraform Variables

```bash
cd infrastructure

# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**terraform.tfvars:**
```hcl
aws_region        = "us-east-1"
project_name      = "picker-scheduler"
ec2_instance_type = "t3.small"
db_instance_class = "db.t3.micro"
db_name           = "picker_scheduler"
db_username       = "picker_admin"
db_password       = "YourSecurePassword123!"  # Change this!
key_pair_name     = "picker-scheduler-key"
github_repo       = "https://github.com/your-username/picker-scheduler.git"
```

### Step 3: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init

# Preview changes
terraform plan

# Apply (creates all resources)
terraform apply
```

Wait 10-15 minutes for setup to complete. Terraform will output:
- EC2 Public IP
- RDS Endpoint
- SSH command

### Step 4: Verify Deployment

```bash
# SSH into server
ssh -i ~/.ssh/picker-scheduler-key.pem ec2-user@<PUBLIC_IP>

# Check services
sudo systemctl status picker-backend
sudo systemctl status picker-frontend

# View logs
sudo journalctl -u picker-backend -f
```

### Step 5: Access Application

- **Frontend**: http://<PUBLIC_IP>:3000
- **API Docs**: http://<PUBLIC_IP>:8000/docs

### Setting Up Auto-Deploy (GitHub Actions)

1. Go to GitHub repository Settings > Secrets and variables > Actions
2. Add these secrets:
   - `EC2_HOST`: Your EC2 public IP
   - `EC2_SSH_KEY`: Contents of your .pem file

The workflow file is at `.github/workflows/deploy.yml`.

Push to `main` branch triggers automatic deployment.

### Updating the Deployment

**Manual Update:**
```bash
ssh -i ~/.ssh/picker-scheduler-key.pem ec2-user@<PUBLIC_IP>

cd /opt/picker-scheduler
git pull

# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
deactivate

# Frontend
cd ../frontend
npm install
npm run build

# Restart services
sudo systemctl restart picker-backend picker-frontend
```

**Or push to main** for auto-deploy.

### Destroying Infrastructure

```bash
cd infrastructure
terraform destroy
```

This removes all AWS resources.

---

## Docker Compose Deployment

### Prerequisites

- Docker and Docker Compose installed
- Server with 2GB+ RAM

### Step 1: Clone Repository

```bash
git clone https://github.com/your-username/picker-scheduler.git
cd picker-scheduler
```

### Step 2: Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
nano backend/.env
```

**.env:**
```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/picker_scheduler
SECRET_KEY=your-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

### Step 3: Build and Start

```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Step 4: Run Migrations

```bash
docker-compose exec backend alembic upgrade head
```

### Step 5: Access Application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Docker Compose Services

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  db:
    image: postgres:14
    environment:
      POSTGRES_DB: picker_scheduler
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/picker_scheduler
      SECRET_KEY: change-me-in-production
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    depends_on:
      - backend

volumes:
  postgres_data:
```

### Managing Docker Deployment

```bash
# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs backend
docker-compose logs frontend

# Shell into container
docker-compose exec backend bash
```

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (or Docker)

### Step 1: Start Database

**Option A: Docker**
```bash
docker-compose up -d db
```

**Option B: Local PostgreSQL**
```bash
createdb picker_scheduler
```

### Step 2: Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database URL

# Run migrations
alembic upgrade head

# Start server (with auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Step 4: Access Application

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SECRET_KEY` | JWT signing key | Required (generate secure key) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration | 1440 (24 hours) |
| `APP_NAME` | Application name | Picker Scheduler |
| `DEBUG` | Enable debug mode | false |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Auto-detected |

---

## Database Management

### Running Migrations

```bash
# Apply all migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "Description of change"

# Rollback one migration
alembic downgrade -1

# View migration history
alembic history
```

### Database Backup (RDS)

RDS automatically creates daily backups with 7-day retention.

**Manual snapshot:**
```bash
aws rds create-db-snapshot \
  --db-instance-identifier picker-scheduler-db \
  --db-snapshot-identifier manual-backup-$(date +%Y%m%d)
```

### Database Backup (Docker)

```bash
# Backup
docker-compose exec db pg_dump -U postgres picker_scheduler > backup.sql

# Restore
docker-compose exec -T db psql -U postgres picker_scheduler < backup.sql
```

---

## SSL/HTTPS Configuration

### Option 1: AWS Certificate Manager + Load Balancer

1. Request SSL certificate in ACM
2. Add Application Load Balancer in Terraform
3. Configure HTTPS listener
4. Update security groups

### Option 2: Nginx + Let's Encrypt

```bash
# Install Certbot
sudo dnf install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot-renew.timer
```

### Option 3: Cloudflare Proxy

1. Add domain to Cloudflare
2. Configure DNS records
3. Enable "Full" SSL mode
4. Cloudflare handles SSL termination

---

## Monitoring

### Application Logs

```bash
# Backend logs
sudo journalctl -u picker-backend -f

# Frontend logs
sudo journalctl -u picker-frontend -f

# Combined logs
sudo journalctl -u 'picker-*' -f
```

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Frontend health
curl http://localhost:3000
```

### CloudWatch (AWS)

Enable CloudWatch agent for:
- CPU/Memory metrics
- Disk usage
- Custom application metrics

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status picker-backend

# View full logs
sudo journalctl -u picker-backend -n 100

# Check for port conflicts
sudo lsof -i :8000
sudo lsof -i :3000
```

### Database Connection Issues

```bash
# Test connection
psql -h <RDS_ENDPOINT> -U picker_admin -d picker_scheduler

# Check security group allows connection
aws ec2 describe-security-groups --group-ids <SG_ID>
```

### Frontend Build Fails

```bash
# Check Node.js version
node --version  # Should be 18+

# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Memory Issues

If running t3.micro (1GB RAM):
```bash
# Add swap space
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Consider upgrading to t3.small (2GB RAM) for production.

---

## Security Checklist

- [ ] Change default database password
- [ ] Generate secure SECRET_KEY
- [ ] Configure CORS for production domains
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules (security groups)
- [ ] Enable RDS encryption at rest
- [ ] Disable debug mode in production
- [ ] Set up regular backups
- [ ] Configure log retention
- [ ] Review IAM permissions
