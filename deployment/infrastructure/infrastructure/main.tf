# main.tf
module "vpc" {
  source = "./modules/vpc"

  project            = var.project
  region             = var.region
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  subnet_count       = var.subnet_count
  default_route      = "0.0.0.0/0"
}

module "eks" {
  source = "./modules/eks"

  project            = var.project
  region             = var.region
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = concat(module.vpc.public_subnet_ids, module.vpc.private_subnet_ids)
  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_subnet_ids
  cluster_version    = var.cluster_version
  desired_size       = var.desired_size
  min_size           = var.min_size
  max_size           = var.max_size
}
