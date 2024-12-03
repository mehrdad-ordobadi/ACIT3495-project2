variable "project" {
  description = "The project name"
  type        = string
}
variable "region" {
  description = "The region to deploy the VPC"
  type        = string
}
variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
}
variable "subnet_count" {
  description = "The number of subnets to create"
  type        = number
}
variable "availability_zone" {
  description = "value of the availability zone"
  type        = string
}
variable "default_route" {
  description = "The default route for the route table"
  type        = string
  default = "0.0.0.0/0"
}