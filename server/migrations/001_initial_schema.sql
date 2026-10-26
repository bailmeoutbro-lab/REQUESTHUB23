CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_system_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO system_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_name (name),
  UNIQUE KEY uq_departments_code (code),
  KEY idx_departments_active_name (is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  institutional_email VARCHAR(254) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(100) NULL,
  role ENUM('faculty_staff', 'mis', 'administrator') NOT NULL DEFAULT 'faculty_staff',
  department_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_institutional_email (institutional_email),
  KEY idx_users_role_active (role, is_active),
  KEY idx_users_department (department_id),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS request_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_request_categories_name (name),
  KEY idx_request_categories_active_name (is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO request_categories (name, description) VALUES
  ('Hardware', 'Computers, peripherals, and other ICT equipment'),
  ('Software', 'Operating systems, applications, and software support'),
  ('Network & Internet', 'Network connectivity, Wi-Fi, and internet access'),
  ('Accounts & Access', 'Institutional accounts, passwords, and access requests'),
  ('Other', 'ICT support requests not covered by another category');

CREATE TABLE IF NOT EXISTS requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(32) NOT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  assigned_mis_user_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('new', 'in_progress', 'waiting_on_requester', 'resolved', 'closed') NOT NULL DEFAULT 'new',
  resolution_note TEXT NULL,
  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_requests_request_number (request_number),
  KEY idx_requests_status_created (status, created_at),
  KEY idx_requests_requester_created (requester_user_id, created_at),
  KEY idx_requests_department_created (department_id, created_at),
  KEY idx_requests_category_created (category_id, created_at),
  KEY idx_requests_assigned_status (assigned_mis_user_id, status),
  CONSTRAINT fk_requests_requester FOREIGN KEY (requester_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_requests_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_requests_category FOREIGN KEY (category_id)
    REFERENCES request_categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_requests_assigned_mis FOREIGN KEY (assigned_mis_user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS request_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  action ENUM('submitted', 'status_changed', 'reassigned', 'resolution_updated') NOT NULL,
  old_status ENUM('new', 'in_progress', 'waiting_on_requester', 'resolved', 'closed') NULL,
  new_status ENUM('new', 'in_progress', 'waiting_on_requester', 'resolved', 'closed') NULL,
  old_assignee_user_id BIGINT UNSIGNED NULL,
  new_assignee_user_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_request_history_request_created (request_id, created_at),
  CONSTRAINT fk_request_history_request FOREIGN KEY (request_id)
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_request_history_actor FOREIGN KEY (actor_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_request_history_old_assignee FOREIGN KEY (old_assignee_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_request_history_new_assignee FOREIGN KEY (new_assignee_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS request_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  media_type VARCHAR(120) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_request_attachments_request (request_id),
  CONSTRAINT fk_request_attachments_request FOREIGN KEY (request_id)
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_request_attachments_user FOREIGN KEY (uploaded_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS satisfaction_ratings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  rated_by_user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_satisfaction_request (request_id),
  KEY idx_satisfaction_created (created_at),
  CONSTRAINT chk_satisfaction_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_satisfaction_request FOREIGN KEY (request_id)
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_satisfaction_user FOREIGN KEY (rated_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  affected_record_type VARCHAR(60) NOT NULL,
  affected_record_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_logs_created (created_at),
  KEY idx_activity_logs_actor_created (actor_user_id, created_at),
  KEY idx_activity_logs_record (affected_record_type, affected_record_id),
  CONSTRAINT fk_activity_logs_actor FOREIGN KEY (actor_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_expiry (expires_at),
  KEY idx_auth_sessions_user (user_id),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
