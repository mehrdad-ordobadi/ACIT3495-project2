resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  instance_tenancy     = "default"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "${var.project}-vpc"
    "kubernetes.io/cluster/${var.project}-cluster" = "shared"
  }
}

resource "aws_subnet" "main" {
  count                   = var.subnet_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = count.index % 3 == 0 ? true : false

  tags = {
    Name = "${var.project}-subnet-${count.index}"
    "kubernetes.io/cluster/${var.project}-cluster" = "shared"
    # Required tags for Kubernetes ALB Ingress
    "kubernetes.io/role/elb"               = count.index % 3 == 0 ? "1" : null
    "kubernetes.io/role/internal-elb"      = count.index % 3 != 0 ? "1" : null
  }
}

# S3 endpoint for EKS operations
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.region}.s3"
  
  tags = {
    Name = "${var.project}-s3-endpoint"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project}-igw"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags = {
    Name = "${var.project}-nat-eip"
  }
}

# NAT Gateway for private subnet internet access (needed for DockerHub)
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.main[0].id  # Placing in the first public subnet

  tags = {
    Name = "${var.project}-nat"
  }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "main" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = var.default_route
    gateway_id = aws_internet_gateway.this.id
  }
  tags = {
    Name = "${var.project}-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = var.default_route
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project}-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = ceil(var.subnet_count / 3.0)  # Only for public subnets
  subnet_id      = aws_subnet.main[count.index * 3].id
  route_table_id = aws_route_table.main.id
}

resource "aws_route_table_association" "private" {
  count          = var.subnet_count - ceil(var.subnet_count / 3.0)  # For private subnets
  subnet_id      = aws_subnet.main[count.index + ceil(var.subnet_count / 3.0)].id
  route_table_id = aws_route_table.private.id
}