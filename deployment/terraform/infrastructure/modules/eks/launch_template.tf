# eks/launch_template.tf
resource "aws_launch_template" "node" {
  name = "${var.project}-node-template"

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      delete_on_termination = true # Cleanup on instance termination
      encrypted             = true # Enable encryption for security
    }
  }

  instance_type = "t3.xlarge"

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 for security
    http_put_response_hop_limit = 2
    http_protocol_ipv6          = "disabled" # Disable IPv6 if not needed
  }

  monitoring {
    enabled = true
  }

  vpc_security_group_ids = [aws_security_group.node.id]

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name                                               = "${var.project}-node"
      "k8s.io/cluster-autoscaler/enabled"                = "true"
      "k8s.io/cluster-autoscaler/${var.project}-cluster" = "owned"
      "kubernetes.io/cluster/${var.project}-cluster"     = "owned"
    }
  }
  user_data = base64encode(<<-EOF
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==MYBOUNDARY=="

--==MYBOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
set -ex

# Enable IMDSv2
TOKEN=$(curl -X PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" "http://169.254.169.254/latest/api/token")
REGION=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/placement/region)

# Bootstrap the node
/etc/eks/bootstrap.sh ${aws_eks_cluster.main.name} \
    --b64-cluster-ca ${aws_eks_cluster.main.certificate_authority[0].data} \
    --apiserver-endpoint ${aws_eks_cluster.main.endpoint} \
    --dns-cluster-ip 10.100.0.10 \
    --container-runtime containerd \
    --kubelet-extra-args '--max-pods=110 --node-labels=eks.amazonaws.com/nodegroup=${var.project}-node-group'

--==MYBOUNDARY==--
EOF
  )
  update_default_version = true
}
