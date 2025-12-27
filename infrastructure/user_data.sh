#!/bin/bash
set -e

# Log all output
exec > >(tee /var/log/user-data.log) 2>&1
echo "Starting user data script at $(date)"

# Update system
dnf update -y

# Install Docker
dnf install -y docker git

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Install Docker Compose
DOCKER_COMPOSE_VERSION="v2.24.0"
curl -L "https://github.com/docker/compose/releases/download/$${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Create app directory
mkdir -p /opt/${project_name}
cd /opt/${project_name}

# Clone the repository
git clone https://github.com/malamapl09/Picker-Scheduler.git .

# Create production environment file for backend
cat > /opt/${project_name}/backend/.env << 'ENVFILE'
DATABASE_URL=postgresql://${db_username}:${db_password}@${db_host}:${db_port}/${db_name}
SECRET_KEY=${jwt_secret_key}
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ENVIRONMENT=production
DEBUG=false
ENVFILE

# Create production environment file for frontend
cat > /opt/${project_name}/frontend/.env.local << 'ENVFILE'
NEXT_PUBLIC_API_URL=http://localhost:8000
ENVFILE

# Create production docker-compose override
cat > /opt/${project_name}/docker-compose.prod.yml << 'COMPOSEFILE'
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://${db_username}:${db_password}@${db_host}:${db_port}/${db_name}
      - SECRET_KEY=${jwt_secret_key}
      - ACCESS_TOKEN_EXPIRE_MINUTES=1440
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_API_URL=http://localhost:8000
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend
    restart: always
COMPOSEFILE

# Build and start the application
cd /opt/${project_name}
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
sleep 30

# Run database migrations
docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

# Seed initial data (if needed)
docker-compose -f docker-compose.prod.yml exec -T backend python -c "from app.scripts.seed_data import seed_all; seed_all()" || true

# Create systemd service for docker-compose
cat > /etc/systemd/system/${project_name}.service << 'SERVICEFILE'
[Unit]
Description=${project_name} Docker Compose Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/${project_name}
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SERVICEFILE

# Enable the service
systemctl daemon-reload
systemctl enable ${project_name}.service

echo "User data script completed at $(date)"
echo "Application should be available at:"
echo "  - Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "  - Backend API: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
