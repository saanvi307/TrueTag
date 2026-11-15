-- Run after db/officers.sql and db/food-businesses.sql in the same MySQL database.
-- Creates only the inspection assignment table.
CREATE TABLE IF NOT EXISTS trutag_inspection_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  officer_id BIGINT UNSIGNED NOT NULL,
  food_business_id BIGINT UNSIGNED NOT NULL,
  inspection_type VARCHAR(100) NOT NULL,
  inspection_date DATE NOT NULL,
  jurisdiction VARCHAR(180) NOT NULL,
  status ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trutag_assignments_date (inspection_date),
  KEY idx_trutag_assignments_officer (officer_id),
  KEY idx_trutag_assignments_business (food_business_id),
  CONSTRAINT fk_trutag_assignments_officer FOREIGN KEY (officer_id) REFERENCES trutag_officers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_trutag_assignments_business FOREIGN KEY (food_business_id) REFERENCES trutag_food_businesses(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
