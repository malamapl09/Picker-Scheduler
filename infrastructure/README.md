# AWS Deployment Guide (Native - No Docker)

This guide walks you through deploying the Picker Scheduling System to AWS using Terraform.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         AWS Cloud                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Default VPC                         │  │
│  │                                                        │  │
│  │   ┌─────────────────────┐    ┌──────────────────────┐ │  │
│  │   │   EC2 (t3.micro)    │    │   RDS PostgreSQL     │ │  │
│  │   │                     │    │   (db.t3.micro)      │ │  │
│  │   │  ┌───────────────┐  │    │                      │ │  │
│  │   │  │ Next.js :3000 │  │───▶│  picker_scheduler    │ │  │
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

## Cost: $0/month (AWS Free Tier)

| Resource | Free Tier Allowance |
|----------|---------------------|
| EC2 t3.micro | 750 hours/month |
| RDS db.t3.micro | 750 hours/month |
| EBS Storage | 30 GB |
| RDS Storage | 20 GB |

## Deployment Steps

### 1. Create SSH Key Pair

```bash
aws ec2 create-key-pair \
  --key-name picker-scheduler-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/picker-scheduler-key.pem

chmod 400 ~/.ssh/picker-scheduler-key.pem
```

### 2. Configure Terraform

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 3. Deploy

```bash
terraform init
terraform apply
```

Wait 10-15 minutes for setup to complete.

### 4. Access Your Application

- **Frontend**: http://<PUBLIC_IP>:3000
- **API Docs**: http://<PUBLIC_IP>:8000/docs

## Managing the Deployment

### SSH into Server

```bash
ssh -i ~/.ssh/picker-scheduler-key.pem ec2-user@<PUBLIC_IP>
```

### View Logs

```bash
# Backend logs
sudo journalctl -u picker-backend -f

# Frontend logs
sudo journalctl -u picker-frontend -f
```

### Restart Services

```bash
sudo systemctl restart picker-backend
sudo systemctl restart picker-frontend
```

### Manual Update

```bash
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

# Restart
sudo systemctl restart picker-backend picker-frontend
```

## Auto-Deploy with GitHub Actions

Push to `main` branch triggers automatic deployment.

### Setup (one-time)

1. Go to https://github.com/YOUR_REPO/settings/secrets/actions
2. Add secrets:
   - `EC2_HOST`: Your EC2 public IP
   - `EC2_SSH_KEY`: Contents of your .pem file

## Converting Existing Docker Deployment

If you have an existing Docker-based deployment, run:

```bash
ssh -i ~/.ssh/picker-scheduler-key.pem ec2-user@<PUBLIC_IP>
cd /opt/picker-scheduler
chmod +x infrastructure/setup-server.sh
./infrastructure/setup-server.sh
```

## Cleanup

```bash
terraform destroy
```
