ALTER TABLE requests
  ADD COLUMN location VARCHAR(180) NULL AFTER department_id,
  ADD COLUMN assessment_note TEXT NULL AFTER description;

ALTER TABLE request_history
  MODIFY COLUMN action ENUM(
    'submitted',
    'status_changed',
    'reassigned',
    'resolution_updated',
    'assessment_updated'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('new_request', 'status_changed', 'assigned', 'assessment_updated') NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(500) NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_user_unread (user_id, read_at, created_at),
  KEY idx_notifications_request (request_id, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_request FOREIGN KEY (request_id)
    REFERENCES requests (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
