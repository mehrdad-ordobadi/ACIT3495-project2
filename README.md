# Microservices Data Analytics Platform

A containerized microservices system for data collection and analytics, demonstrating modern cloud-native architecture with Kubernetes deployment on AWS EKS.

![Kubernetes](https://img.shields.io/badge/kubernetes-%23326ce5.svg?style=for-the-badge&logo=kubernetes&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)
![Terraform](https://img.shields.io/badge/terraform-%235835CC.svg?style=for-the-badge&logo=terraform&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

## 1. Key Learning Outcomes

This project demonstrates:

* Microservices Design Patterns: Service decomposition and communication
* Container Orchestration: Kubernetes deployment and management
* Cloud Infrastructure: AWS EKS, networking, and security
* Infrastructure as Code: Terraform for reproducible infrastructure

### 1.1 Note

This is a student project designed for learning purposes and demonstrates core concepts of microservices architecture and Kubernetes deployment. For production use, additional security hardening, monitoring, and error handling would be recommended.

## 2. Architecture Overview

The system implements a microservices architecture with the following components:

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Enter Data    │    │  Show Results   │    │ Authentication  │
│   (Node.js)     │    │   (Node.js)     │    │   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                        ┌─────────────────┐
                        │   Analytics     │
                        │   (Python)      │
                        └─────────────────┘
                               │
                 ┌──────────────┴──────────────┐
            ┌────▼────┐                   ┌────▼────┐
            │  MySQL  │                   │ MongoDB │
            │   DB    │                   │   DB    │
            └─────────┘                   └─────────┘

### 2.1. Service Responsibilities

- **Enter Data Service**: Web application for authenticated data collection, writes to MySQL
- **Show Results Service**: Web application for displaying analytics, reads from MongoDB  
- **Authentication Service**: Validates user credentials across all services
- **Analytics Service**: Processes data from MySQL and stores aggregated results in MongoDB
- **MySQL Database**: Primary data storage for raw user inputs
- **MongoDB Database**: Analytics data storage for processed results

## 3. Technology Stack

- **Container Orchestration**: Kubernetes, Helm Charts
- **Cloud Infrastructure**: AWS EKS, VPC, ALB
- **Infrastructure as Code**: Terraform
- **Programming Languages**: Node.js, Python
- **Databases**: MySQL 8.0, MongoDB
- **Security**: AWS Secrets Manager, IAM Roles, CSI Secret Store Driver
- **Monitoring**: Kubernetes health checks, HPA autoscaling

## 4. Features

- **Microservices Architecture**: Loosely coupled services with dedicated responsibilities
- **Cloud-Native Deployment**: Production-ready Kubernetes manifests with auto-scaling
- **Infrastructure Automation**: Complete AWS infrastructure provisioning with Terraform
- **Security Integration**: AWS Secrets Manager for secure credential management
- **Health Monitoring**: Comprehensive liveness and readiness probes
- **Auto-scaling**: Horizontal Pod Autoscaler based on CPU utilization
- **Load Balancing**: AWS Application Load Balancer with Ingress controller

## 5. Prerequisites

- AWS CLI configured with appropriate permissions
- kubectl installed and configured
- Terraform >= 1.0
- Docker (for local development)

## 6. Deployment

### 6.1. Infrastructure Setup

Deploy the EKS cluster and supporting AWS resources:

```bash
cd deployment/terraform/infrastructure
terraform init
terraform plan
terraform apply
```
### 6.2. Configure kubectl

Run the following command to update the kubectl context:

```
aws eks update-kubeconfig --region us-west-2 --name k8s-cluster
```

### 6.3. Deploy Application

Run the following commands to deploy application on the cluster:

```
cd deployment/k8s
kubectl apply -k .
```

## 7. Access the application

Get the load balancer URL:

```
kubectl get ingress api-ingress
```

Access the services:

* Enter Data: http://<ALB-URL>/enter-data
* Show Results: http://<ALB-URL>/results

## 8. Project Structure

├── services/
│   ├── authentication-service/    # Node.js authentication service
│   ├── analytics-service/         # Python analytics processor
│   ├── enter-data/               # Node.js data collection web app
│   └── show-results/             # Node.js results display web app
├── deployment/
│   ├── k8s/                      # Kubernetes manifests
│   │   ├── base/applications/    # Application deployments
│   │   ├── base/databases/       # Database StatefulSets
|   |   ├── base/ingress/         # Load balancer configs
|   |   ├── base/storage/         # Storage manifests
│   │   ├── base/configmaps/      # Configuration management
│   │   └── base/secrets/         # Secret management
│   └── terraform/                # Infrastructure as Code
│       └── infrastructure/       # EKS cluster and VPC
└── docs/                         # Additional documentation

## 9. Security Features

* IAM Integration: Service accounts with AWS IAM roles
* Secrets Management: AWS Secrets Manager with CSI driver
* Network Security: Security groups and network policies
* Container Security: Non-root containers with resource limits

## 10. Default Users

The system includes two test users:

* user1 / password1
* user2 / password2

## 11. License

This project is available under the MIT License.



