#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Picker Scheduler - AWS Deployment    ${NC}"
echo -e "${GREEN}========================================${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: Terraform is not installed${NC}"
    echo "Install from: https://www.terraform.io/downloads"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Install from: https://aws.amazon.com/cli/"
    exit 1
fi

echo -e "${GREEN}✓ Terraform installed${NC}"
echo -e "${GREEN}✓ AWS CLI installed${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✓ AWS credentials configured${NC}"

# Check for terraform.tfvars
if [ ! -f "terraform.tfvars" ]; then
    echo -e "\n${YELLOW}terraform.tfvars not found. Let's create it...${NC}"

    # Get key pair name
    echo -e "\n${YELLOW}Available SSH key pairs in AWS:${NC}"
    aws ec2 describe-key-pairs --query 'KeyPairs[*].KeyName' --output table

    read -p "Enter your SSH key pair name: " KEY_NAME

    # Generate secure passwords
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    JWT_SECRET=$(openssl rand -base64 32)

    cat > terraform.tfvars << EOF
# AWS Configuration
aws_region = "us-east-1"

# Project Settings
project_name = "picker-scheduler"
environment  = "prod"

# EC2 Configuration
ec2_instance_type = "t3.micro"
ec2_key_name      = "${KEY_NAME}"

# RDS Configuration
db_instance_class = "db.t3.micro"
db_name           = "picker_scheduler"
db_username       = "postgres"
db_password       = "${DB_PASSWORD}"

# Application Configuration
jwt_secret_key = "${JWT_SECRET}"
EOF

    echo -e "${GREEN}✓ Created terraform.tfvars with secure passwords${NC}"
    echo -e "${YELLOW}Note: Save these passwords somewhere safe!${NC}"
    echo -e "  Database password: ${DB_PASSWORD}"
fi

# Initialize Terraform
echo -e "\n${YELLOW}Initializing Terraform...${NC}"
terraform init

# Plan
echo -e "\n${YELLOW}Planning deployment...${NC}"
terraform plan -out=tfplan

# Confirm deployment
echo -e "\n${YELLOW}Ready to deploy. This will create:${NC}"
echo "  - 1 x EC2 t3.micro instance"
echo "  - 1 x RDS PostgreSQL db.t3.micro instance"
echo "  - Security groups and networking"
echo -e "\nEstimated cost: ${GREEN}\$0/month${NC} (Free Tier)"

read -p "Proceed with deployment? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Deploying... (this takes 10-15 minutes)${NC}"
    terraform apply tfplan

    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}  Deployment Complete!                  ${NC}"
    echo -e "${GREEN}========================================${NC}"

    echo -e "\n${YELLOW}Wait 5-10 minutes for the application to fully start.${NC}"
    echo -e "\n${GREEN}Your application will be available at:${NC}"
    terraform output frontend_url
    terraform output api_docs_url

    echo -e "\n${GREEN}To SSH into your server:${NC}"
    terraform output ssh_command
else
    echo -e "${YELLOW}Deployment cancelled${NC}"
fi
