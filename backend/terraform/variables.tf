variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-south1"
}

variable "db_password" {
  description = "PostgreSQL app user password"
  type        = string
  sensitive   = true
}
