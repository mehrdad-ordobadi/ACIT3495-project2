resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"

  set {
    name  = "clusterName"
    value = aws_eks_cluster.main.name
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.alb_controller.arn
  }
  depends_on = [
    aws_eks_node_group.main,
    aws_eks_addon.coredns
  ]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"

  set {
    name  = "args"
    value = "{--kubelet-insecure-tls}"
  }
  depends_on = [
    aws_eks_node_group.main,
    aws_eks_addon.coredns
  ]
}

# Secrets Store CSI Driver via Helm
resource "helm_release" "secrets_store_csi" {
  name       = "csi-secrets-store"
  repository = "https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts"
  chart      = "secrets-store-csi-driver"
  namespace  = "kube-system"
  depends_on = [
    aws_eks_node_group.main,
    aws_eks_addon.coredns
  ]
}

# AWS Provider for Secrets Store CSI Driver
resource "helm_release" "secrets_store_provider_aws" {
  name       = "secrets-provider-aws"
  repository = "https://aws.github.io/secrets-store-csi-driver-provider-aws"
  chart      = "secrets-store-csi-driver-provider-aws"
  namespace  = "kube-system"

  depends_on = [
    helm_release.secrets_store_csi,
    aws_eks_node_group.main,
    aws_eks_addon.coredns
  ]
}

