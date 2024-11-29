variable "mongodb_secret_arn" {
    description = "The ARN of the secret containing the MongoDB connection string"
    default = "arn:aws:secretsmanager:us-west-2:746706907394:secret:mongodb-credentials-NPF0hu"
}
variable "mysql_secret_arn" {
    description = "The ARN of the secret containing the MySQL connection string"
    default = "arn:aws:secretsmanager:us-west-2:746706907394:secret:mysql-credentials-HAytyd"
}