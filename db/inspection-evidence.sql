-- Run after db/inspection-assignments.sql and db/auth-users.sql.
-- Image bytes are kept in MySQL; there is no public static upload directory.
CREATE TABLE IF NOT EXISTS trutag_inspection_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type ENUM('image/jpeg', 'image/png', 'image/webp') NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  uploaded_by_account_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trutag_evidence_assignment (assignment_id, created_at),
  KEY idx_trutag_evidence_uploader (uploaded_by_account_id),
  CONSTRAINT fk_trutag_evidence_assignment FOREIGN KEY (assignment_id) REFERENCES trutag_inspection_assignments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_trutag_evidence_account FOREIGN KEY (uploaded_by_account_id) REFERENCES trutag_user_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
