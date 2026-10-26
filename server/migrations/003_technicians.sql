CREATE TABLE IF NOT EXISTS technicians (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  gender VARCHAR(40) NOT NULL,
  specialization VARCHAR(100) NOT NULL,
  experience_years TINYINT UNSIGNED NOT NULL,
  contact VARCHAR(32) NOT NULL,
  availability ENUM('Available', 'Unavailable') NOT NULL DEFAULT 'Available',
  is_placeholder BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_technicians_active_name (is_active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO technicians
  (name, description, gender, specialization, experience_years, contact, availability, is_placeholder)
SELECT seed.name, seed.description, seed.gender, seed.specialization, seed.experience_years,
  seed.contact, 'Available', TRUE
FROM (
  SELECT 'Angelo' AS name, 'Supports software installation, configuration, and troubleshooting.' AS description, 'Male' AS gender, 'Software' AS specialization, 3 AS experience_years, '09123456781' AS contact
  UNION ALL SELECT 'Canillo', 'Assists with computer hardware diagnostics, repair, and maintenance.', 'Male', 'Hardware', 7, '09123456782'
  UNION ALL SELECT 'David', 'Handles hardware troubleshooting and workstation maintenance.', 'Male', 'Hardware', 5, '09123456789'
  UNION ALL SELECT 'Harriet', 'Helps resolve software issues and supports campus applications.', 'Female', 'Software', 4, '09123456784'
  UNION ALL SELECT 'Kurt', 'Provides software setup and application troubleshooting.', 'Male', 'Software', 2, '09123456785'
  UNION ALL SELECT 'Lorince', 'Supports network connectivity and basic network troubleshooting.', 'Male', 'Network', 4, '09123456787'
  UNION ALL SELECT 'Miguel', 'Assists with network setup, connectivity, and diagnostics.', 'Male', 'Network', 3, '09123456783'
  UNION ALL SELECT 'Rave', 'Helps maintain software installations and campus applications.', 'Male', 'Software', 3, '09123456788'
  UNION ALL SELECT 'Tubo', 'Handles hardware repairs, diagnostics, and equipment maintenance.', 'Male', 'Hardware', 6, '09123456786'
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM technicians existing
  WHERE existing.name = seed.name AND existing.is_placeholder = TRUE
);
