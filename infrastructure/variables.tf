# AWS Region
variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

# Project name
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "picker-scheduler"
}

# Environment
variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# EC2 Configuration
variable "ec2_instance_type" {
  description = "EC2 instance type (t3.micro is free tier eligible)"
  type        = string
  default     = "t3.micro"
}

variable "ec2_key_name" {
  description = "Name of the SSH key pair for EC2 access"
  type        = string
}

# RDS Configuration
variable "db_instance_class" {
  description = "RDS instance class (db.t3.micro is free tier eligible)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "picker_scheduler"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

# Application Configuration
variable "jwt_secret_key" {
  description = "Secret key for JWT tokens"
  type        = string
  sensitive   = true
}

# Domain (optional)
variable "domain_name" {
  description = "Custom domain name (optional)"
  type        = string
  default     = ""
}
