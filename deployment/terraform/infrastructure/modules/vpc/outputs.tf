output "vpc_id" {
  description = "The VPC ID"
  value       = aws_vpc.main.id
}

output "subnets" {
  description = "The subnets"
  value       = aws_subnet.main
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = [for subnet in aws_subnet.main : subnet.id if subnet.map_public_ip_on_launch == false]
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = [for subnet in aws_subnet.main : subnet.id if subnet.map_public_ip_on_launch == true]
}

