# AWS Deployment Guide

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
│  │   │   ┌─────────────┐   │    │   (db.t3.micro)      │ │  │
│  │   │   │  Frontend   │   │    │                      │ │  │
│  │   │   │  (Next.js)  │   │───▶│  picker_scheduler    │ │  │
│  │   │   │  :3000      │   │    │  :5432               │ │  │
│  │   │   ├─────────────┤   │    │                      │ │  │
│  │   │   │  Backend    │   │    │  Automated backups   │ │  │
│  │   │   │  (FastAPI)  │   │    │  7-day retention     │ │  │
│  │   │   │  :8000      │   │    └──────────────────────┘ │  │
│  │   │   └─────────────┘   │                              │  │
│  │   │                     │                              │  │
│  │   │   Elastic IP        │                              │  │
│  │   └─────────────────────┘                              │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Account** with Free Tier eligibility
2. **AWS CLI** installed and configured
3. **Terraform** installed (v1.0+)
4. **SSH Key Pair** in AWS

## Cost Estimate (Free Tier)

| Resource | Free Tier Allowance | Monthly Cost |
|----------|---------------------|--------------|
| EC2 t3.micro | 750 hours | $0 |
| RDS db.t3.micro | 750 hours | $0 |
| EBS Storage | 30 GB | $0 |
| RDS Storage | 20 GB | $0 |
| Elastic IP | Free when attached | $0 |
| **Total** | | **$0** |

> Note: Free tier lasts 12 months from AWS account creation.

## Deployment Steps

### 1. Create SSH Key Pair (if you don't have one)

```bash
# Create key pair in AWS
aws ec2 create-key-pair \
  --key-name picker-scheduler-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/picker-scheduler-key.pem

# Set correct permissions
chmod 400 ~/.ssh/picker-scheduler-key.pem
```

### 2. Configure Terraform

```bash
cd infrastructure

# Copy the example tfvars file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**Required values to change:**
- `ec2_key_name`: Name of your SSH key pair
- `db_password`: Strong database password
- `jwt_secret_key`: Random secret for JWT tokens

Generate secure passwords:
```bash
# Generate random password
openssl rand -base64 32
```

### 3. Initialize and Deploy

```bash
# Initialize Terraform
terraform init

# Preview the changes
terraform plan

# Deploy (takes ~10-15 minutes)
terraform apply
```

### 4. Wait for Setup

After `terraform apply` completes, wait 5-10 minutes for:
- EC2 instance to boot
- Docker to install
- Application to build and start
- Database migrations to run

### 5. Access Your Application

Terraform will output the URLs:
```
frontend_url = "http://X.X.X.X:3000"
backend_url = "http://X.X.X.X:8000"
api_docs_url = "http://X.X.X.X:8000/docs"
```

Default login credentials:
- **Manager**: `manager@example.com` / `manager123`
- **Employee**: Check seeded data

## Managing Your Deployment

### SSH into the Server

```bash
ssh -i ~/.ssh/picker-scheduler-key.pem ec2-user@<PUBLIC_IP>
```

### View Logs

```bash
# All logs
cd /opt/picker-scheduler
docker-compose -f docker-compose.prod.yml logs -f

# Backend only
docker-compose -f docker-compose.prod.yml logs -f backend

# Frontend only
docker-compose -f docker-compose.prod.yml logs -f frontend
```

### Restart Application

```bash
cd /opt/picker-scheduler
docker-compose -f docker-compose.prod.yml restart
```

### Update Application

```bash
cd /opt/picker-scheduler
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

### Run Database Migrations

```bash
cd /opt/picker-scheduler
docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

## Troubleshooting

### Check User Data Script Logs

```bash
sudo cat /var/log/user-data.log
```

### Check Docker Status

```bash
sudo systemctl status docker
docker ps
```

### Check Application Status

```bash
cd /opt/picker-scheduler
docker-compose -f docker-compose.prod.yml ps
```

### Common Issues

1. **Application not accessible after deployment**
   - Wait 5-10 minutes for full setup
   - Check security group allows ports 3000, 8000
   - Check user data logs for errors

2. **Database connection errors**
   - Verify RDS is in "Available" state
   - Check security group allows PostgreSQL from EC2

3. **Out of memory**
   - t3.micro has 1GB RAM - may need t3.small for heavy load

## Cleanup

To destroy all resources and avoid charges:

```bash
terraform destroy
```

## Adding a Custom Domain (Optional)

1. Register domain in Route 53 or use external registrar
2. Create an A record pointing to the Elastic IP
3. Update nginx config for your domain
4. Add SSL with Let's Encrypt:

```bash
# On EC2 instance
sudo dnf install -y certbot
sudo certbot certonly --standalone -d your-domain.com
```

## Security Recommendations

For production use:

1. [ ] Change default passwords
2. [ ] Enable RDS deletion protection
3. [ ] Set up CloudWatch alarms
4. [ ] Enable VPC Flow Logs
5. [ ] Use AWS Secrets Manager for credentials
6. [ ] Set up SSL/HTTPS
7. [ ] Restrict SSH access to your IP only
