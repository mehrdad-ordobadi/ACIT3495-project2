
# outputs.tf
output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "secrets_role_arn" {
  description = "ARN of the IAM role for the secrets store CSI driver"
  value       = module.eks.secret_role_arn
}