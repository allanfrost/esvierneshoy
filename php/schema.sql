-- Opret tabel til permanente besøgslog
CREATE TABLE IF NOT EXISTS visit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  timezone VARCHAR(100) NULL,
  is_friday TINYINT(1) NULL,
  forced_mode ENUM('friday', 'no') NULL,
  season VARCHAR(30) NULL,
  generated_at DATETIME NULL,
  remote_addr VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created_at (created_at),
  KEY idx_timezone (timezone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
