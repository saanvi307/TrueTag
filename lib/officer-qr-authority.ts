export type OfficerAccessStatus = 'active' | 'suspended' | 'revoked';
export type OfficerCredentialStatus = 'valid' | 'pending' | 'expired' | 'revoked';
export type QrAuthorityOutcome = 'authority_verified' | 'identity_verified_authority_not_confirmed' | 'verification_failed';

export function evaluateOfficerQrAuthority(status: OfficerAccessStatus, credentialStatus: OfficerCredentialStatus) {
  if (status === 'revoked' || credentialStatus === 'revoked') {
    return { outcome: 'verification_failed' as const, reasons: ['The officer credential has been revoked.'] };
  }
  const reasons: string[] = [];
  if (credentialStatus !== 'valid') reasons.push('The officer credential is not currently valid.');
  if (status === 'suspended') reasons.push('The officer is currently suspended.');
  return {
    outcome: reasons.length ? 'identity_verified_authority_not_confirmed' as const : 'authority_verified' as const,
    reasons,
  };
}
