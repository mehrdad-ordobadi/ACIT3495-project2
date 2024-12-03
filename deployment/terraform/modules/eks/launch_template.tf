# eks/launch_template.tf
resource "aws_launch_template" "node" {
  name = "${var.project}-node-template"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size = 20
      volume_type = "gp3"
      delete_on_termination = true     # Cleanup on instance termination
      encrypted            = true      # Enable encryption for security
    }
  }

  instance_type = "t3.medium"

 metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2 for security
    http_put_response_hop_limit = 1
    http_protocol_ipv6         = "disabled"  # Disable IPv6 if not needed
  }

  monitoring {
    enabled = true
  }

  vpc_security_group_ids = [aws_security_group.node.id]

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project}-node"
      "k8s.io/cluster-autoscaler/enabled" = "true"
      "k8s.io/cluster-autoscaler/${var.project}-cluster" = "owned"
      "kubernetes.io/cluster/${var.project}-cluster" = "owned"
    }
  }
    user_data = base64encode(<<-EOF
    #!/bin/bash
    /etc/eks/bootstrap.sh ${aws_eks_cluster.main.name}
    EOF
  )
  update_default_version = true
}
