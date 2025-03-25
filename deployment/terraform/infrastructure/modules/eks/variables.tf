variable "project" {
  description = "The name of the project"
  type        = string
}
variable "region" {
  description = "The region to deploy the resources"
  type        = string

}
variable "vpc_id" {
  description = "The ID of the VPC"
  type        = string

}
variable "cluster_version" {
  description = "The version of the EKS cluster"
  type        = string
}

variable "subnet_ids" {
  description = "The IDs of the subnets to attach to the EKS cluster"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "The IDs of the private subnets to attach to the EKS node group"
  type        = list(string)
}
variable "public_subnet_ids" {
  description = "The IDs of the public subnets to attach to the EKS node group"
  type        = list(string)

}
variable "desired_size" {
  description = "The desired number of worker nodes"
  type        = number
  default     = 2
}
variable "max_size" {
  description = "The maximum number of worker nodes"
  type        = number
  default     = 3
}
variable "min_size" {
  description = "The minimum number of worker nodes"
  type        = number
  default     = 2
}