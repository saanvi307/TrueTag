-- Run after db/inspection-verification-tokens.sql and
-- db/inspection-verification-token-references.sql.
-- Keep the officer and inspection rows; update authority state and revoke their live QR tokens.
ALTER TABLE trutag_officers
  MODIFY credential_status ENUM('valid', 'pending', 'expired', 'revoked') NOT NULL DEFAULT 'pending';

UPDATE trutag_officers
SET status = 'revoked', credential_status = 'revoked'
WHERE status = 'revoked' OR credential_status = 'revoked';

UPDATE trutag_inspection_verification_tokens t
JOIN trutag_inspection_assignments a ON a.id = t.assignment_id
JOIN trutag_officers o ON o.id = a.officer_id
SET t.revoked_at = UTC_TIMESTAMP()
WHERE (o.status = 'revoked' OR o.credential_status = 'revoked') AND t.revoked_at IS NULL;
