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
│   │   │   ├── mysql-config.yaml          # MySQL init scripts and config
│   │   │   ├── mongodb-config.yaml        # MongoDB init scripts and config
│   │   │   └── app-config.yaml            # Application configurations
│   │   ├── secrets/
│   │   │   ├── mysql-secrets.yaml         # MySQL credentials
│   │   │   └── mongodb-secrets.yaml       # MongoDB credentials
│   │   ├── storage/
│   │   │   └── storage-class.yaml         # gp2 storage class config
│   │   ├── databasesa/
│   │   │   ├── mysql/
│   │   │   │   ├── statefulset.yaml      # Changed from deployment
│   │   │   │   └── service.yaml          # Headless service for StatefulSet
│   │   │   └── mongodb/
│   │   │       ├── statefulset.yaml      # Changed from deployment
│   │   │       └── service.yaml          # Headless service for StatefulSet
│   │   └── applications/
│   │       ├── auth-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml
│   │       │   └── hpa.yaml
│   │       ├── analytics-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml
│   │       │   └── hpa.yaml
│   │       ├── enter-data-service/
│   │       │   ├── deployment.yaml
│   │       │   ├── service.yaml
│   │       │   └── hpa.yaml
│   │       └── show-results-service/
│   │           ├── deployment.yaml
│   │           ├── service.yaml
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
Create database deployments and services
Implement database health checks and probes

e.g. 

e.g.
```
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

# databases/mysql/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: mysql-secrets
type: Opaque
data:
  root-password: base64encodedpassword
  user-password: base64encodedpassword

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

## 4. Database migration:

### 4.1. MySQL
* Configuration
* Initialization scripts
* Persistence setup
* Health checks

### 4.2. MongoDB
* Configuration
* Initialization scripts
* Persistence setup
* Health checks

## 5. Application Deployments

### 5.1. Deployment manifest: 
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

### 5.2. Service manifest (LoadBalancer/ClusterIP)

Configure networking --> External services as LoadBalancer, Internal services as ClusterIP

### 5.3. ConfigMaps/secrets for configuration

Any configurations/secrets needed (.env files) etc.

### 5.4. HorizontalPodAutoscaler (HPA) configuration

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

### 5.5. Probe configurations:

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


## 6. Best practices - optional:
### 6.1. Network policy:
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

### 6.2. Backup strategy
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

### 6.3. Logging and monitoring 
out of scope.

### 6.4. Labels and Annotations
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
