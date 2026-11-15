-- Run this against the existing TruTag MySQL database before using Officer Management.
-- This migration only creates the module's table if it does not already exist.
CREATE TABLE IF NOT EXISTS trutag_officers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  officer_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  designation VARCHAR(120) NOT NULL,
  department VARCHAR(160) NOT NULL,
  district VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(180) NOT NULL,
  credential_status ENUM('valid', 'pending', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
  status ENUM('active', 'suspended', 'revoked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trutag_officers_officer_id (officer_id),
  KEY idx_trutag_officers_status (status),
  KEY idx_trutag_officers_district (district),
  KEY idx_trutag_officers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
