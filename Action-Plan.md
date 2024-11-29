# Steps for project2:

## 1. Infrastructure provisioning:

### 1.1. VPC and Networking
* Subnets (public/private)
* Internet Gateway
* NAT Gateway
* Route Tables

### 1.2. EKS Cluster
* Control plane configuration
* Security groups
* Worker node IAM roles

### 1.3. Node Groups
* Launch templates
* Autoscaling configuration
* Instance types

e.g.
```
# main.tf example structure
module "vpc" {
  # VPC configuration
}

module "eks" {
  # EKS cluster configuration
}

module "node_groups" {
  # EKS node groups with launch templates
}
```

## 2. organize kubernetes manifest structure:

```
.
├── k8s/
│   ├── base/
│   │   ├── configmaps/
│   │   │   ├── mysql-config.yaml
│   │   │   ├── mongodb-config.yaml
│   │   │   └── app-config.yaml
│   │   ├── secrets/
│   │   │   ├── mysql-secrets.yaml
│   │   │   └── mongodb-secrets.yaml
│   │   ├── storage/
│   │   │   └── storage-class.yaml
│   │   ├── ingress/
|   |   |   └── ingress.yaml     # Just the ingress rules for routing
|   |   |
│   │   ├── databases/
│   │   │   ├── mysql/
│   │   │   │   ├── statefulset.yaml
│   │   │   │   └── service.yaml
│   │   │   └── mongodb/
│   │   │       ├── statefulset.yaml
│   │   │       └── service.yaml
│   │   └── applications/
│   │       ├── auth-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml         # ClusterIP
│   │       │   └── hpa.yaml
│   │       ├── analytics-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml         # ClusterIP
│   │       │   └── hpa.yaml
│   │       ├── enter-data-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml         # ClusterIP
│   │       │   └── hpa.yaml
│   │       └── show-results-service/
│   │           ├── deployment.yaml
│   │           ├── service.yaml         # ClusterIP
│   │           └── hpa.yaml
│   └── dev/
│       └── kustomization.yaml
├── terraform/
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── versions.tf

```
## 3. Service Code Modifications

### 3.1. Update service discovery URLs:

The current setup uses Docker Compose service names for communication. In Kubernetes, we'll use Kubernetes Services with the following pattern:

http://<service-name>.<namespace>.svc.cluster.local

e.g.:

```
// Current authentication call in enter-data/app.js:
const authResponse = await axios.post(`http://${process.env.AUTH_SERVICE_HOST || 'authentication-service'}:${process.env.AUTH_SERVICE_PORT || '8000'}/validate`...

// Should become:
const authResponse = await axios.post(`http://auth-service.default.svc.cluster.local:8000/validate`...

------------------------

# Current MongoDB connection in analytics_service.py:
return MongoClient(os.environ.get('MONGO_URI', 'mongodb://writer:writerpassword@mongodb:27017/analyticsdb'))

# Should become:
return MongoClient(os.environ.get('MONGO_URI', 'mongodb://writer:writerpassword@mongodb.default.svc.cluster.local:27017/analyticsdb'))
```

### 3.2. Implement health check endpoints:

We need to healthcheck endpoints to our services so that k8s can probe them.

e.g.
e.g.
```
# Add to analytics_service.py
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/health/live')
def liveness():
    return jsonify({"status": "healthy"}), 200

@app.route('/health/ready')
def readiness():
    try:
        # Test MySQL connection
        mysql_conn = get_mysql_connection()
        mysql_conn.cursor()
        mysql_conn.close()
        
        # Test MongoDB connection
        mongo_client = get_mongodb_connection()
        mongo_client.server_info()
        mongo_client.close()
        
        return jsonify({"status": "ready"}), 200
    except Exception as e:
        return jsonify({"status": "not ready", "error": str(e)}), 503
```

### 3.3. Service-specific modifications:
* Auth Service:
  * Add health endpoints
  * Update service discovery URLs
* Analytics Service:
  * Add Flask health endpoints
  * Update database connections
* Enter-data Service:
  * Add health endpoints
  * Update auth service URL
* Show-results Service:
  * Add health endpoints
  * Update auth service URL

## 4. Database migration:

Create ConfigMaps for database initialization scripts
Create Secrets for sensitive data
Create PersistentVolumeClaims
Create statefulset and services (headless clusterIP service)
Implement database health checks and probes

e.g. 

e.g.
```
# databases/mysql/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
 name: mysql
spec:
 serviceName: mysql
 replicas: 1
 selector:
   matchLabels:
     app: mysql
 template:
   metadata:
     labels:
       app: mysql
   spec:
     containers:
     - name: mysql
       image: mysql:8.0
       ports:
       - containerPort: 3306
       env:
       - name: MYSQL_ROOT_PASSWORD
         valueFrom:
           secretKeyRef:
             name: mysql-secrets
             key: root-password
       - name: MYSQL_DATABASE
         value: datadb
       volumeMounts: #--> 3. makes both available to the container at specified path
       - name: mysql-persistent-storage #--> provided by configMap
         mountPath: /var/lib/mysql
       - name: init-scripts
         mountPath: /docker-entrypoint-initdb.d #--> provided by configMap
       resources:
         requests:
           cpu: "500m"
           memory: "1Gi"
         limits:
           cpu: "1"
           memory: "2Gi"
       livenessProbe:
         exec:
           command: ["mysqladmin", "ping", "-h", "localhost"]
         initialDelaySeconds: 30
         periodSeconds: 10
     volumes: #--> 2. mounts configMap
     - name: init-scripts
       configMap:
         name: mysql-config
 volumeClaimTemplates: #--> 1. creates EBS volume
 - metadata:
     name: mysql-persistent-storage
   spec:
     accessModes: ["ReadWriteOnce"]
     storageClassName: "gp2"
     resources:
       requests:
         storage: 10Gi


# databases/mysql/service.yaml
apiVersion: v1
kind: Service
metadata:
 name: mysql
spec:
 clusterIP: None  # Headless service
 selector:
   app: mysql
 ports:
 - port: 3306

# databases/mysql/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mysql-config
data:
  init.sql: |
    CREATE DATABASE IF NOT EXISTS datadb;
    USE datadb;
    CREATE TABLE IF NOT EXISTS data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userid VARCHAR(255) NOT NULL,
      value FLOAT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );


# configmaps/app-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  MYSQL_HOST: "mysql.default.svc.cluster.local"
  MONGO_HOST: "mongodb.default.svc.cluster.local"
  AUTH_SERVICE_HOST: "auth-service.default.svc.cluster.local"
```
### 4.1. Secret management flow:

* create secrets on AWS manuallly - 1 for mysql (root password, 2 users, 2 users passwords), 1 for mongodb (same).
* create role to access those secrets.
e.g.
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:my-application-secret-*"
        }
    ]
}
```
* edit trust relationship for the role:
e.g.
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/oidc.eks.REGION.amazonaws.com/id/EXAMPLE"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.REGION.amazonaws.com/id/EXAMPLE:sub": "system:serviceaccount:default:my-application-sa"
                }
            }
        }
    ]
}
```
after eks cluster is created:
* install secret store CSI driver, Setting up necessary RBAC permissions, Creating required CustomResourceDefinitions
e.g. 
```
resource "helm_release" "secrets_store_csi_driver" {
  name       = "csi-secrets-store"
  repository = "https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts"
  chart      = "secrets-store-csi-driver"
  namespace  = "kube-system"
}

# Install AWS provider
resource "helm_release" "secrets_store_csi_driver_provider_aws" {
  name       = "secrets-provider-aws"
  repository = "https://aws.github.io/secrets-store-csi-driver-provider-aws"
  chart      = "secrets-store-csi-driver-provider-aws"
  namespace  = "kube-system"
}
```
* Create other k8s resources:
first a service account - e.g.
```
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-application-sa
  namespace: default
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT_ID:role/the-role-you-created

```
* then a secret provider class which defines how to access secrets - e.g.:
```
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-secrets
  namespace: default
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "my-application-secret"
        objectType: "secretsmanager"
        jmesPath: 
          - path: username
            objectAlias: username
          - path: password
            objectAlias: password
```
* finally access the secrets in the deployment etc..., e.g.:

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-application
spec:
  replicas: 1
  template:
    spec:
      serviceAccountName: my-application-sa
      containers:
      - name: application
        image: your-image:tag
        volumeMounts:
        - name: secrets-store
          mountPath: "/mnt/secrets-store"
          readOnly: true
      volumes:
      - name: secrets-store
        csi:
          driver: secrets-store.csi.k8s.io
          readOnly: true
          volumeAttributes:
            secretProviderClass: "aws-secrets"
```

* the flow is:

```
Infrastructure Setup:

Create AWS Secret manually
Create IAM role and policies manually
Provision EKS cluster using Terraform
Install CSI driver and AWS provider using Helm


Application Setup:

Create ServiceAccount with IAM role annotation
Create SecretProviderClass defining how to fetch secrets
Deploy application with volumes configured to mount secrets


Runtime Flow:

Pod starts up and mounts the CSI volume
CSI driver sees the mount request
Driver checks SecretProviderClass configuration
AWS provider authenticates using pod's ServiceAccount
Provider fetches secrets from AWS Secrets Manager
Secrets are mounted as files in the pod
Application can now read secrets from the mounted path
```

### 4.2. Storage class
* first create the storage class - this will create an EBS class. e.g.
```
# deployment/k8s/base/storage/storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp2
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp2
  encrypted: "true"
reclaimPolicy: Retain
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

* you also need to install EBS CSI (Container Storage Interface) driver. e.g.

```
# Enable EBS CSI driver add-on
resource "aws_eks_addon" "ebs_csi" {
  cluster_name                = module.eks.cluster_name
  addon_name                 = "aws-ebs-csi-driver"
  addon_version             = "v1.20.0-eksbuild.1"  # Use appropriate version
  service_account_role_arn  = aws_iam_role.ebs_csi_driver.arn
}

# Create IAM role for EBS CSI Driver
resource "aws_iam_role" "ebs_csi_driver" {
  name = "ebs-csi-driver"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:aud": "sts.amazonaws.com",
            "${module.eks.oidc_provider}:sub": "system:serviceaccount:kube-system:ebs-csi-controller-sa"
          }
        }
      }
    ]
  })
}

# Attach required AWS managed policy
resource "aws_iam_role_policy_attachment" "ebs_csi_policy" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  role       = aws_iam_role.ebs_csi_driver.name
}
```

### 4.3. Database migration flow:

#### 4.3.1. MySQL
* Configuration
* Initialization scripts
* Persistence setup
* Health checks

#### 4.3.2. MongoDB
* Configuration
* Initialization scripts
* Persistence setup
* Health checks


## 5. Loadbalancing:
we will use ingress for this:

the flow is:
* configure ingress:
e.g. 
```
# k8s/base/ingress/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
spec:
  ingressClassName: alb
  rules:
  - http:
      paths:
      - path: /enter-data
        pathType: Prefix
        backend:
          service:
            name: enter-data-service
            port:
              number: 8001
      - path: /results
        pathType: Prefix
        backend:
          service:
            name: show-results-service
            port:
              number: 8002
```
* create the underlying infrastructure for role, policy, helm via terraform:

```
# Create IAM policy for the ALB Controller
resource "aws_iam_policy" "aws_load_balancer_controller" {
  name = "AWSLoadBalancerControllerIAMPolicy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Actions = [
          "iam:CreateServiceLinkedRole",
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeTags",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeTags",
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:DeleteTargetGroup",
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
        ]
        Resources = ["*"]
      }
    ]
  })
}

# Create IAM role for the ALB Controller
resource "aws_iam_role" "aws_load_balancer_controller" {
  name = "aws-load-balancer-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
            "${module.eks.oidc_provider}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
          }
        }
      }
    ]
  })
}

# Attach ALB Controller policy
resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  policy_arn = aws_iam_policy.aws_load_balancer_controller.arn
  role       = aws_iam_role.aws_load_balancer_controller.name
}

# Install ALB Controller using Helm
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.aws_load_balancer_controller.arn
  }

  set {
    name  = "region"
    value = var.region
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }
}
```

* make sure you are importing helm provider:

```
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
      command     = "aws"
    }
  }
}
```

## 6. Application Deployments

### 6.1. Deployment manifest: 
Define pods for each service here
Resource Requirements defined here e.g.:

```
resources:
          requests:
            # Guaranteed minimum
            cpu: "100m"        # 0.1 CPU core
            memory: "128Mi"    # 128 MB memory
          limits:
            # Maximum allowed
            cpu: "200m"        # 0.2 CPU core
            memory: "256Mi"    # 256 MB memory
```

Set up security context, e.g.:

```
resources:
          requests:
            # Guaranteed minimum
            cpu: "100m"        # 0.1 CPU core
            memory: "128Mi"    # 128 MB memory
          limits:
            # Maximum allowed
            cpu: "200m"        # 0.2 CPU core
            memory: "256Mi"    # 256 MB memory
```

### 6.2. Service manifest (LoadBalancer/ClusterIP)

Configure networking --> External services as LoadBalancer, Internal services as ClusterIP

### 6.3. ConfigMaps/secrets for configuration

Any configurations/secrets needed (.env files) etc.

### 6.4. HorizontalPodAutoscaler (HPA) configuration

services may need autoscaling - lets do horizontal AS. Common metrics: CPU usage, memory usage, custom metrics.

e.g.
```
# auth-service/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 6.5. Probe configurations:

add probes:

```
# auth-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  template:
    spec:
      containers:
      - name: auth-service
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 15  # Wait before first check
          periodSeconds: 10        # Check interval
          timeoutSeconds: 5        # Timeout for each check
          failureThreshold: 3      # Failed attempts before restart
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 5
          successThreshold: 1      # Minimum consecutive successes
          failureThreshold: 3
```
look into: Liveness Probe, Readiness Probe, Startup Probe + probe parameters + probe types: HTTP GET probe, # Command probe (for databases), # TCP probe (for network services)


## 7. Best practices - optional:
### 7.1. Network policy:
Define allowed traffic between pods
Usually: Default Network Behavior
Without Network Policies:

All pods can communicate with all other pods
No network restrictions between pods
Similar to having all ports open between all pods
External access is still controlled by Security Groups/Services

e.g. 
```
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: auth-service-policy
spec:
  podSelector:
    matchLabels:
      app: auth-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: enter-data
    - podSelector:
        matchLabels:
          app: show-results
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: mysql
    ports:
    - protocol: TCP
      port: 3306
```

### 7.2. Backup strategy
Cron jobs in k8s - out of scope of this project.

e.g.
```
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"  # Run at 2 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: db-backup
            image: mysql:8.0
            command:
            - /bin/sh
            - -c
            - |
              mysqldump -h mysql.default.svc.cluster.local -u backup_user -p"${MYSQL_BACKUP_PASSWORD}" \
              --all-databases > /backup/db-$(date +%Y%m%d).sql
            env:
            - name: MYSQL_BACKUP_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mysql-backup-credentials
                  key: password
```

### 7.3. Logging and monitoring 
out of scope.

### 7.4. Labels and Annotations
Use consistent labeling for all resources
Add informative annotations
e.g. 
```apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
    component: backend
    tier: authentication
    environment: development
  annotations:
    description: "Authentication service for user validation"
    maintainer: "team@example.com"
    version: "1.0.0"
spec:
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
        component: backend
        tier: authentication
        environment: development
```

### 7.5. AWS Application Load Balancer (ALB) with built-in SSL termination at the Load Balancer level.

* Configure ALB Controller with SSL

```
# k8s/base/ingress/ingress.yml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    # SSL Settings
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}, {"HTTP":80}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/certificate-arn: ${aws_acm_certificate.alb_cert.arn}
    # Health Check Settings
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-port: traffic-port
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: '15'
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
    alb.ingress.kubernetes.io/success-codes: '200'
    alb.ingress.kubernetes.io/healthy-threshold-count: '2'
    alb.ingress.kubernetes.io/unhealthy-threshold-count: '2'
spec:
  rules:
  - http:
      paths:
      - path: /enter-data
        pathType: Prefix
        backend:
          service:
            name: enter-data-service
            port:
              number: 8001
      - path: /results
        pathType: Prefix
        backend:
          service:
            name: show-results-service
            port:
              number: 8002
```

* setting up the ALB with SSL:
```
# 1. Create ACM Certificate
resource "aws_acm_certificate" "alb_cert" {
  domain_name       = "*.elb.amazonaws.com"
  validation_method = "DNS"

  tags = {
    Environment = "dev"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# 2. IAM Role for ALB Controller
resource "aws_iam_role" "alb_controller" {
  name = "eks-alb-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:aud": "sts.amazonaws.com",
            "${module.eks.oidc_provider}:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
          }
        }
      }
    ]
  })
}

# 3. IAM Policy for ALB Controller
resource "aws_iam_policy" "alb_controller" {
  name = "AWSLoadBalancerControllerIAMPolicy"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Actions = [
          "iam:CreateServiceLinkedRole",
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeTags",
          "ec2:GetCoipPoolUsage",
          "ec2:DescribeCoipPools",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeTags"
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "cognito-idp:DescribeUserPoolClient",
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "iam:ListServerCertificates",
          "iam:GetServerCertificate",
          "waf-regional:GetWebACL",
          "waf-regional:GetWebACLForResource",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL",
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL",
          "shield:GetSubscriptionState",
          "shield:DescribeProtection",
          "shield:CreateProtection",
          "shield:DeleteProtection"
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress"
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:CreateSecurityGroup"
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:CreateTags"
        ]
        Resources = ["arn:aws:ec2:*:*:security-group/*"]
        Condition = {
          StringEquals = {
            "ec2:CreateAction" = "CreateSecurityGroup"
          }
          Null = {
            "aws:RequestTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:CreateTags",
          "ec2:DeleteTags"
        ]
        Resources = ["arn:aws:ec2:*:*:security-group/*"]
        Condition = {
          Null = {
            "aws:RequestTag/elbv2.k8s.aws/cluster" = "true",
            "aws:ResourceTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:DeleteSecurityGroup"
        ]
        Resources = ["*"]
        Condition = {
          Null = {
            "aws:ResourceTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateTargetGroup"
        ]
        Resources = ["*"]
        Condition = {
          Null = {
            "aws:RequestTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteRule"
        ]
        Resources = ["*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags"
        ]
        Resources = [
          "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
          "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*",
          "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*"
        ]
        Condition = {
          Null = {
            "aws:RequestTag/elbv2.k8s.aws/cluster" = "true",
            "aws:ResourceTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags"
        ]
        Resources = [
          "arn:aws:elasticloadbalancing:*:*:listener/app/*/*",
          "arn:aws:elasticloadbalancing:*:*:listener/net/*/*",
          "arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*",
          "arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*"
        ]
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:SetIpAddressType",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:DeleteTargetGroup"
        ]
        Resources = ["*"]
        Condition = {
          Null = {
            "aws:ResourceTag/elbv2.k8s.aws/cluster" = "false"
          }
        }
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets"
        ]
        Resources = ["arn:aws:elasticloadbalancing:*:*:targetgroup/*/*"]
      },
      {
        Effect = "Allow"
        Actions = [
          "elasticloadbalancing:SetWebAcl",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:AddListenerCertificates",
          "elasticloadbalancing:RemoveListenerCertificates",
          "elasticloadbalancing:ModifyRule"
        ]
        Resources = ["*"]
      }
    ]
  })
}

# 4. Attach policy to role
resource "aws_iam_role_policy_attachment" "alb_controller" {
  policy_arn = aws_iam_policy.alb_controller.arn
  role       = aws_iam_role.alb_controller.name
}

# 5. Install ALB Controller using Helm
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller.arn
  }

  set {
    name  = "region"
    value = var.region
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }

  depends_on = [
    aws_iam_role_policy_attachment.alb_controller
  ]
}
```
This is out of the scope of this project.

### 7.6. Security groups:

* Node Group Security Group (for worker nodes):

```
resource "aws_security_group" "node_group_sg" {
  name        = "eks-node-group-sg"
  description = "Security group for EKS node group"
  vpc_id      = module.vpc.vpc_id

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow communication between nodes
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }
}
```

* Load Balancer Security Group (for ALB):
```
resource "aws_security_group" "alb_sg" {
  name        = "eks-alb-sg"
  description = "Security group for ALB"
  vpc_id      = module.vpc.vpc_id

  # Allow inbound HTTP/HTTPS
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Or restrict to specific IPs
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Or restrict to specific IPs
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```
* Cluster Security Group (for control plane):
```
resource "aws_security_group" "cluster_sg" {
  name        = "eks-cluster-sg"
  description = "Security group for EKS control plane"
  vpc_id      = module.vpc.vpc_id

  # Allow worker nodes to communicate with control plane
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.node_group_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```
* Then use these in your EKS configuration:
```
module "eks" {
  source = "terraform-aws-modules/eks/aws"
  
  cluster_name    = "your-cluster"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  
  cluster_security_group_id          = aws_security_group.cluster_sg.id
  node_security_group_id            = aws_security_group.node_group_sg.id
  
  # Other configurations...
}
```
this will be implemented.