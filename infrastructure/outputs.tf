# EC2 Outputs
output "app_public_ip" {
  description = "Public IP address of the application server"
  value       = aws_eip.app.public_ip
}

output "app_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

# Application URLs
output "frontend_url" {
  description = "URL to access the frontend"
  value       = "http://${aws_eip.app.public_ip}:3000"
}

output "backend_url" {
  description = "URL to access the backend API"
  value       = "http://${aws_eip.app.public_ip}:8000"
}

output "api_docs_url" {
  description = "URL to access the API documentation"
  value       = "http://${aws_eip.app.public_ip}:8000/docs"
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_hostname" {
  description = "RDS instance hostname"
  value       = aws_db_instance.main.address
}

# SSH Command
output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip}"
}

# Useful Commands
output "useful_commands" {
  description = "Useful commands for managing the deployment"
  value       = <<-EOT

    # SSH into the instance:
    ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip}

    # View application logs:
    ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip} 'cd /opt/${var.project_name} && docker-compose -f docker-compose.prod.yml logs -f'

    # Restart the application:
    ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip} 'cd /opt/${var.project_name} && docker-compose -f docker-compose.prod.yml restart'

    # Update the application:
    ssh -i ~/.ssh/${var.ec2_key_name}.pem ec2-user@${aws_eip.app.public_ip} 'cd /opt/${var.project_name} && git pull && docker-compose -f docker-compose.prod.yml up -d --build'
  EOT
}
