terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "nearme-terraform-state"
    prefix = "nearme/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" { type = string }
variable "region"     { default = "asia-south1" }
variable "db_password" {
  type      = string
  sensitive = true
}

# ─── VPC ────────────────────────────────────────────────────────────────────
resource "google_compute_network" "vpc" {
  name                    = "nearme-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "nearme-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_vpc_access_connector" "connector" {
  name          = "nearme-vpc-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name
}

# ─── Secret Manager ─────────────────────────────────────────────────────────
locals {
  secrets = [
    "nearme-db-url", "nearme-redis-url", "nearme-jwt-access", "nearme-jwt-refresh",
    "nearme-razorpay-key-id", "nearme-razorpay-key-secret",
    "nearme-agora-app-id", "nearme-agora-cert",
    "nearme-gcs-bucket", "nearme-gcs-sa-key", "nearme-encryption-key"
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secrets)
  secret_id = each.key
  replication { auto {} }
}

# ─── Cloud SQL (PostgreSQL 15) ───────────────────────────────────────────────
resource "google_sql_database_instance" "postgres" {
  name             = "nearme-postgres"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-g1-small"
    availability_type = "REGIONAL"
    disk_size         = 20
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
      backup_retention_settings { retained_backups = 7 }
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "nearme_db" {
  name     = "nearme"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app_user" {
  name     = "nearme_app"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ─── Memorystore Redis ───────────────────────────────────────────────────────
resource "google_redis_instance" "redis" {
  name           = "nearme-redis"
  tier           = "STANDARD_HA"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version = "REDIS_7_0"
}

# ─── Cloud Storage ───────────────────────────────────────────────────────────
resource "google_storage_bucket" "media" {
  name          = "nearme-media-prod"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true
  versioning { enabled = true }

  lifecycle_rule {
    condition { age = 365 }
    action    { type = "Delete" }
  }
}

# ─── Artifact Registry ───────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "nearme"
  format        = "DOCKER"
}

# ─── Service Account ─────────────────────────────────────────────────────────
resource "google_service_account" "api" {
  account_id   = "nearme-api-sa"
  display_name = "NearMe API Service Account"
}

resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "storage_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each  = toset(local.secrets)
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

# ─── Cloud Run ───────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "api" {
  name     = "nearme-api"
  location = var.region

  template {
    service_account = google_service_account.api.email

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "ALL_TRAFFIC"
    }

    scaling {
      min_instance_count = 2
      max_instance_count = 20
    }

    containers {
      image = "gcr.io/${var.project_id}/nearme-api:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "512Mi"
        }
      }

      ports { container_port = 4000 }

      env { name = "NODE_ENV" value = "production" }

      dynamic "env" {
        for_each = toset(local.secrets)
        content {
          name = replace(upper(replace(env.value, "nearme-", "")), "-", "_")
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      liveness_probe {
        http_get { path = "/health/live" }
        initial_delay_seconds = 10
        period_seconds        = 30
      }

      startup_probe {
        http_get { path = "/health/ready" }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }
  }
}

# ─── Cloud Load Balancer + Cloud Armor ───────────────────────────────────────
resource "google_compute_security_policy" "armor" {
  name = "nearme-armor"

  rule {
    action   = "allow"
    priority = 1000
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
  }

  rule {
    action   = "deny(403)"
    priority = 900
    match {
      expr { expression = "evaluatePreconfiguredExpr('xss-stable')" }
    }
  }

  rule {
    action   = "deny(403)"
    priority = 901
    match {
      expr { expression = "evaluatePreconfiguredExpr('sqli-stable')" }
    }
  }

  rule {
    action   = "throttle"
    priority = 100
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = 1000
        interval_sec = 60
      }
    }
  }
}

# ─── Outputs ─────────────────────────────────────────────────────────────────
output "api_url"          { value = google_cloud_run_v2_service.api.uri }
output "redis_host"       { value = google_redis_instance.redis.host }
output "db_connection"    { value = google_sql_database_instance.postgres.connection_name }
output "storage_bucket"   { value = google_storage_bucket.media.name }
