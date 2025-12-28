# Picker Scheduling System Documentation

Welcome to the Picker Scheduling System documentation. This guide will help you understand, use, and deploy the system.

## Quick Links

### User Guides
- [Manager Guide](guides/manager-guide.md) - Complete guide for managers using the system
- [Employee Guide](guides/employee-guide.md) - Guide for employees to view schedules and manage availability

### Technical Documentation
- [API Reference](api/README.md) - Complete REST API documentation
- [Architecture](architecture/README.md) - System design, database schema, and technical details
- [Deployment Guide](deployment.md) - How to deploy to production (AWS, Docker, Local)

### Infrastructure
- [AWS Deployment](../infrastructure/README.md) - Terraform deployment to AWS

## Overview

The Picker Scheduling System is a workforce management solution designed for retail online order fulfillment operations. It automates the scheduling of picker employees across multiple store locations.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| Schedule Optimization | Auto-generate schedules using constraint satisfaction |
| Demand Forecasting | Predict order volume from historical data |
| Compliance Engine | Enforce labor rules automatically |
| Manager Portal | Review, edit, and publish schedules |
| Employee Portal | View schedules, manage availability, request time off |
| Reporting | Labor costs, efficiency, and compliance metrics |

### User Roles

| Role | Access Level |
|------|--------------|
| **Admin** | Full access to all stores and system configuration |
| **Manager** | Manage schedules, employees, and approve requests for assigned stores |
| **Employee** | View own schedule, submit availability, request time off and swaps |

## Getting Started

### For New Users

1. **Managers**: Start with the [Manager Guide](guides/manager-guide.md)
2. **Employees**: Start with the [Employee Guide](guides/employee-guide.md)

### For Developers

1. Review the [Architecture](architecture/README.md) documentation
2. Check the [API Reference](api/README.md) for endpoint details
3. Follow the [Deployment Guide](deployment.md) for setup

### For DevOps/Admins

1. Follow the [Deployment Guide](deployment.md) for production setup
2. Review [AWS Infrastructure](../infrastructure/README.md) for Terraform deployment

## Document Structure

```
docs/
├── README.md              # This file
├── deployment.md          # Deployment instructions
├── api/
│   └── README.md          # API reference
├── guides/
│   ├── manager-guide.md   # Manager user guide
│   └── employee-guide.md  # Employee user guide
└── architecture/
    └── README.md          # Technical architecture
```

## Support

For technical issues:
1. Check the troubleshooting sections in relevant guides
2. Review application logs
3. Contact your system administrator

## Updates

This documentation is maintained alongside the codebase. For the latest version, always refer to the repository.
