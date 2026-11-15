-- Run after db/auth-users.sql and db/inspection-assignments.sql.
-- Only token hashes are stored. The signed token is shown once in its QR code.
CREATE TABLE IF NOT EXISTS trutag_inspection_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  issued_by_account_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trutag_verification_token_hash (token_hash),
  KEY idx_trutag_verification_token_assignment (assignment_id),
  KEY idx_trutag_verification_token_expiry (expires_at),
  CONSTRAINT fk_trutag_verification_token_assignment FOREIGN KEY (assignment_id) REFERENCES trutag_inspection_assignments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_trutag_verification_token_account FOREIGN KEY (issued_by_account_id) REFERENCES trutag_user_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
