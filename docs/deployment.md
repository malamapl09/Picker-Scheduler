# Deployment Guide

This guide covers deploying the Picker Scheduling System to production environments.

## Deployment Options

1. **AWS (Recommended)** - EC2 + RDS using Terraform
2. **Manual Server** - Any Linux server with PostgreSQL
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

**Or push to main** for auto-deploy via GitHub Actions.

### Destroying Infrastructure

```bash
cd infrastructure
terraform destroy
```

This removes all AWS resources.

---

## Manual Server Deployment

For deploying to any Linux server (Ubuntu, Amazon Linux, etc.).

### Prerequisites

- Linux server with 2GB+ RAM
- PostgreSQL 14+ (local or remote)
- Python 3.11+
- Node.js 18+
- Git

### Step 1: Install Dependencies

**Amazon Linux 2023:**
```bash
# Update system
sudo dnf update -y

# Install Python 3.11
sudo dnf install -y python3.11 python3.11-pip python3.11-devel

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install PostgreSQL client and build tools
sudo dnf install -y postgresql-devel gcc git
```

**Ubuntu 22.04:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3.11-dev

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL client and build tools
sudo apt install -y libpq-dev build-essential git
```

### Step 2: Clone Repository

```bash
sudo mkdir -p /opt/picker-scheduler
sudo chown $USER:$USER /opt/picker-scheduler
git clone https://github.com/your-username/picker-scheduler.git /opt/picker-scheduler
cd /opt/picker-scheduler
```

### Step 3: Setup Backend

```bash
cd /opt/picker-scheduler/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env  # Edit with your database URL and secret key
```

**.env file:**
```env
DATABASE_URL=postgresql://user:password@host:5432/picker_scheduler
SECRET_KEY=your-secure-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

```bash
# Run migrations
alembic upgrade head

deactivate
```

### Step 4: Setup Frontend

```bash
cd /opt/picker-scheduler/frontend

# Install dependencies
npm install

# Build for production
npm run build
```

### Step 5: Create Systemd Services

**Backend Service:**
```bash
sudo tee /etc/systemd/system/picker-backend.service > /dev/null <<EOF
[Unit]
Description=Picker Scheduler Backend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/picker-scheduler/backend
Environment=PATH=/opt/picker-scheduler/backend/venv/bin
ExecStart=/opt/picker-scheduler/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

**Frontend Service:**
```bash
sudo tee /etc/systemd/system/picker-frontend.service > /dev/null <<EOF
[Unit]
Description=Picker Scheduler Frontend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/picker-scheduler/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### Step 6: Start Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable picker-backend picker-frontend
sudo systemctl start picker-backend picker-frontend
```

### Step 7: Verify

```bash
# Check status
sudo systemctl status picker-backend
sudo systemctl status picker-frontend

# Test endpoints
curl http://localhost:8000/health
curl http://localhost:3000
```

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (local installation or remote)

### Step 1: Setup Database

**Option A: Local PostgreSQL**
```bash
# Create database
createdb picker_scheduler
```

**Option B: Use Remote Database**
- Use an existing PostgreSQL instance
- Update connection string in .env

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

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Auto-detected from browser |

---

## Database Management

### Running Migrations

```bash
cd backend
source venv/bin/activate

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

### Database Backup (Local PostgreSQL)

```bash
# Backup
pg_dump picker_scheduler > backup.sql

# Restore
psql picker_scheduler < backup.sql
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
# Install Nginx and Certbot
sudo dnf install nginx certbot python3-certbot-nginx

# Configure Nginx as reverse proxy
sudo nano /etc/nginx/conf.d/picker-scheduler.conf
```

**Nginx configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot-renew.timer
```

### Option 3: Cloudflare Proxy

1. Add domain to Cloudflare
2. Configure DNS records pointing to your server IP
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

# Last 100 lines
sudo journalctl -u picker-backend -n 100
```

### Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Frontend health
curl http://localhost:3000
```

### Service Management

```bash
# Check status
sudo systemctl status picker-backend
sudo systemctl status picker-frontend

# Restart services
sudo systemctl restart picker-backend
sudo systemctl restart picker-frontend

# Stop services
sudo systemctl stop picker-backend picker-frontend

# Start services
sudo systemctl start picker-backend picker-frontend
```

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
psql -h <HOST> -U <USER> -d picker_scheduler

# Check if PostgreSQL is running
sudo systemctl status postgresql

# For RDS, verify security group allows connection from EC2
```

### Frontend Build Fails

```bash
# Check Node.js version
node --version  # Should be 18+

# Clear cache and rebuild
cd frontend
rm -rf .next node_modules
npm install
npm run build
```

### Memory Issues

If running on a small instance (1GB RAM):
```bash
# Add swap space
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Recommendation: Use t3.small (2GB RAM) for production.

### Permission Issues

```bash
# Fix ownership
sudo chown -R $USER:$USER /opt/picker-scheduler

# Fix Python venv permissions
chmod -R 755 /opt/picker-scheduler/backend/venv
```

---

## Security Checklist

- [ ] Change default database password
- [ ] Generate secure SECRET_KEY (use `openssl rand -hex 32`)
- [ ] Configure CORS for production domains only
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules (security groups)
- [ ] Enable RDS encryption at rest
- [ ] Set up regular backups
- [ ] Configure log retention
- [ ] Review IAM permissions (principle of least privilege)
- [ ] Keep system packages updated
