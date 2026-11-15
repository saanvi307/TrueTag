-- Run after db/inspection-assignments.sql and db/auth-users.sql.
-- Stores the current response per checklist item; assignment and response history is retained.
CREATE TABLE IF NOT EXISTS trutag_inspection_checklist_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  checklist_key VARCHAR(64) NOT NULL,
  response ENUM('compliant', 'non_compliant', 'not_applicable') NOT NULL,
  observation TEXT NULL,
  responded_by_account_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trutag_inspection_checklist_response (assignment_id, checklist_key),
  KEY idx_trutag_checklist_respondent (responded_by_account_id),
  CONSTRAINT fk_trutag_checklist_assignment FOREIGN KEY (assignment_id) REFERENCES trutag_inspection_assignments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_trutag_checklist_account FOREIGN KEY (responded_by_account_id) REFERENCES trutag_user_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
