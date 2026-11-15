-- Run against the existing TruTag MySQL database.
-- Creates only the food business module table; it does not alter other tables.
CREATE TABLE IF NOT EXISTS trutag_food_businesses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_name VARCHAR(180) NOT NULL,
  licence_reference VARCHAR(80) NOT NULL,
  category VARCHAR(100) NOT NULL,
  address VARCHAR(500) NOT NULL,
  district VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(180) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trutag_food_businesses_licence (licence_reference),
  KEY idx_trutag_food_businesses_name (business_name),
  KEY idx_trutag_food_businesses_district (district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
