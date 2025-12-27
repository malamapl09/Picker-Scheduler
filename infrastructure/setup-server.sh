#!/bin/bash
# Setup script to convert existing Docker-based deployment to native
# Run this on the EC2 instance

set -e

echo "========================================="
echo "  Converting to Native Deployment"
echo "========================================="

# Stop and remove Docker containers
echo "Stopping Docker containers..."
cd /opt/picker-scheduler
sudo docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
sudo docker stop picker-frontend 2>/dev/null || true
sudo docker rm picker-frontend 2>/dev/null || true

# Install Node.js 20
echo "Installing Node.js..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install Python 3.11 (don't change system python3 symlink - it breaks dnf)
echo "Installing Python..."
sudo dnf install -y python3.11 python3.11-pip python3.11-devel gcc postgresql-devel

# Pull latest code
echo "Pulling latest code..."
cd /opt/picker-scheduler
git pull origin main

# Setup Backend
echo "Setting up backend..."
cd /opt/picker-scheduler/backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3.11 -m venv venv
fi

# Install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Run migrations
alembic upgrade head
deactivate

# Setup Frontend
echo "Setting up frontend..."
cd /opt/picker-scheduler/frontend
npm install
npm run build

# Install systemd services
echo "Installing systemd services..."
sudo cp /opt/picker-scheduler/infrastructure/systemd/picker-backend.service /etc/systemd/system/
sudo cp /opt/picker-scheduler/infrastructure/systemd/picker-frontend.service /etc/systemd/system/

# Reload and start services
sudo systemctl daemon-reload
sudo systemctl enable picker-backend picker-frontend
sudo systemctl restart picker-backend
sleep 3
sudo systemctl restart picker-frontend

# Check status
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
sudo systemctl status picker-backend --no-pager
echo ""
sudo systemctl status picker-frontend --no-pager
echo ""
echo "Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "Backend:  http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
