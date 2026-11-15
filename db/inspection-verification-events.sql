-- Run after db/inspection-verification-token-references.sql.
-- Records outcomes of signed QR verification attempts; it never stores the QR token itself.
CREATE TABLE IF NOT EXISTS trutag_inspection_verification_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_id CHAR(36) NULL,
  assignment_id BIGINT UNSIGNED NULL,
  outcome ENUM('authority_verified', 'identity_verified_authority_not_confirmed', 'verification_failed') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trutag_verification_event_time (created_at),
  KEY idx_trutag_verification_event_outcome (outcome, created_at),
  KEY idx_trutag_verification_event_assignment (assignment_id, created_at),
  CONSTRAINT fk_trutag_verification_event_token FOREIGN KEY (token_id) REFERENCES trutag_inspection_verification_tokens(token_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_trutag_verification_event_assignment FOREIGN KEY (assignment_id) REFERENCES trutag_inspection_assignments(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
