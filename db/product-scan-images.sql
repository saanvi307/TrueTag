-- Run after db/auth-users.sql. This adds a separate private store for admin product label scans.
CREATE TABLE IF NOT EXISTS trutag_product_scan_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scan_reference CHAR(36) NOT NULL,
  image_view ENUM('front', 'back', 'side') NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type ENUM('image/jpeg', 'image/png', 'image/webp') NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  image_data MEDIUMBLOB NOT NULL,
  uploaded_by_account_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trutag_product_scan_reference (scan_reference, created_at),
  KEY idx_trutag_product_scan_uploader (uploaded_by_account_id),
  CONSTRAINT fk_trutag_product_scan_account FOREIGN KEY (uploaded_by_account_id) REFERENCES trutag_user_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
