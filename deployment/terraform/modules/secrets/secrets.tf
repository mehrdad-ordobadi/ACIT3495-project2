# Create IAM role for accessing secrets
resource "aws_iam_role" "secrets_access_role" {
  name = "eks-secrets-access-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = module.eks.oidc_provider_arn # The OIDC provider ARN  - out put of EKS module (enable IRSA)
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${module.eks.oidc_provider}:aud": "sts.amazonaws.com",
            "${module.eks.oidc_provider}:sub": "system:serviceaccount:default:database-secrets-sa"
          }
        }
      }
    ]
  })
}

# Create policy for MySQL secrets access
resource "aws_iam_policy" "mysql_secrets_policy" {
  name = "mysql-secrets-access-policy"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.mysql_secret_arn
      }
    ]
  })
}

# Create policy for MongoDB secrets access
resource "aws_iam_policy" "mongodb_secrets_policy" {
  name = "mongodb-secrets-access-policy"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.mongodb_secret_arn
      }
    ]
  })
}

# Attach policies to role
resource "aws_iam_role_policy_attachment" "mysql_secrets" {
  policy_arn = aws_iam_policy.mysql_secrets_policy.arn
  role       = aws_iam_role.secrets_access_role.name
}

resource "aws_iam_role_policy_attachment" "mongodb_secrets" {
  policy_arn = aws_iam_policy.mongodb_secrets_policy.arn
  role       = aws_iam_role.secrets_access_role.name
}

# Install the CSI driver via Helm
resource "helm_release" "secrets_store_csi_driver" {
  name       = "csi-secrets-store"
  repository = "https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts"
  chart      = "secrets-store-csi-driver"
  namespace  = "kube-system"
}

# Install AWS provider for CSI driver
resource "helm_release" "secrets_store_csi_driver_provider_aws" {
  name       = "secrets-provider-aws"
  repository = "https://aws.github.io/secrets-store-csi-driver-provider-aws"
  chart      = "secrets-store-csi-driver-provider-aws"
  namespace  = "kube-system"

  depends_on = [helm_release.secrets_store_csi_driver]
}