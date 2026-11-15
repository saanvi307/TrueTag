-- Apply once to existing databases after db/inspection-verification-tokens.sql.
-- Adds an explicit reference for signed token IDs while keeping the signed token itself out of storage.
ALTER TABLE trutag_inspection_verification_tokens
  ADD COLUMN token_id CHAR(36) NULL AFTER id;

UPDATE trutag_inspection_verification_tokens
SET token_id = UUID(), revoked_at = UTC_TIMESTAMP()
WHERE token_id IS NULL;

ALTER TABLE trutag_inspection_verification_tokens
  MODIFY token_id CHAR(36) NOT NULL,
  ADD UNIQUE KEY uq_trutag_verification_token_id (token_id);
