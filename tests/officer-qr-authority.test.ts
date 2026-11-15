import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateOfficerQrAuthority } from '../lib/officer-qr-authority.ts';

test('active officer with valid credential confirms authority', () => {
  assert.deepEqual(evaluateOfficerQrAuthority('active', 'valid'), {
    outcome: 'authority_verified',
    reasons: [],
  });
});

test('suspended officer retains verified identity but authority is not confirmed', () => {
  assert.deepEqual(evaluateOfficerQrAuthority('suspended', 'valid'), {
    outcome: 'identity_verified_authority_not_confirmed',
    reasons: ['The officer is currently suspended.'],
  });
});

test('revoked officer access fails verification even if credential status has not caught up', () => {
  assert.deepEqual(evaluateOfficerQrAuthority('revoked', 'valid'), {
    outcome: 'verification_failed',
    reasons: ['The officer credential has been revoked.'],
  });
});

test('credential revocation fails verification even if access status was not updated', () => {
  assert.equal(evaluateOfficerQrAuthority('active', 'revoked').outcome, 'verification_failed');
});
