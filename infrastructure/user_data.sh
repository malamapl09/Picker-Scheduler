#!/bin/bash
set -e

# Log all output
exec > >(tee /var/log/user-data.log) 2>&1
echo "Starting user data script at $(date)"

# Update system
dnf update -y

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs

# Install Python 3.11 and pip
dnf install -y python3.11 python3.11-pip python3.11-devel git

# Create symlinks
ln -sf /usr/bin/python3.11 /usr/bin/python3
ln -sf /usr/bin/pip3.11 /usr/bin/pip3

# Install build dependencies for Python packages
dnf install -y gcc postgresql-devel

# Create app directory
mkdir -p /opt/picker-scheduler
chown ec2-user:ec2-user /opt/picker-scheduler
cd /opt/picker-scheduler

# Clone the repository as ec2-user
sudo -u ec2-user git clone https://github.com/malamapl09/Picker-Scheduler.git .

# Create environment file
cat > /opt/picker-scheduler/.env << 'ENVFILE'
DATABASE_URL=postgresql://${db_username}:${db_password}@${db_host}:${db_port}/${db_name}
SECRET_KEY=${jwt_secret_key}
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ENVIRONMENT=production
DEBUG=false
ENVFILE
chown ec2-user:ec2-user /opt/picker-scheduler/.env

# Setup Backend
echo "Setting up backend..."
cd /opt/picker-scheduler/backend

# Create virtual environment
sudo -u ec2-user python3 -m venv venv

# Install Python dependencies
sudo -u ec2-user /opt/picker-scheduler/backend/venv/bin/pip install --upgrade pip
sudo -u ec2-user /opt/picker-scheduler/backend/venv/bin/pip install -r requirements.txt

# Run database migrations
sudo -u ec2-user /opt/picker-scheduler/backend/venv/bin/alembic upgrade head

# Setup Frontend
echo "Setting up frontend..."
cd /opt/picker-scheduler/frontend

# Install Node dependencies
sudo -u ec2-user npm install

# Build for production
sudo -u ec2-user npm run build

# Install systemd services
cp /opt/picker-scheduler/infrastructure/systemd/picker-backend.service /etc/systemd/system/
cp /opt/picker-scheduler/infrastructure/systemd/picker-frontend.service /etc/systemd/system/

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable picker-backend picker-frontend
systemctl start picker-backend
sleep 5
systemctl start picker-frontend

# Seed initial data
echo "Seeding database..."
cd /opt/picker-scheduler/backend
sudo -u ec2-user /opt/picker-scheduler/backend/venv/bin/python -m app.scripts.seed_data || true

echo "User data script completed at $(date)"
echo "Application should be available at:"
echo "  - Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "  - Backend API: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
