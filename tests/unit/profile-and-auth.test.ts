import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapProfileRpcError,
  parseProfileBundle,
  parseProfileMutation,
} from '@/features/profile/validation';
import {
  mapAuthSignInError,
  mapAuthSignUpError,
  parseAuthCredentials,
} from '@/features/auth/validation';

test('parseProfileMutation validates profile creation, details and contact updates', () => {
  const created = parseProfileMutation(
    {
      intent: 'create',
      username: 'Player_01',
      display_name: '  Ziad  ',
      governorate_slug: 'cairo',
      account_type: 'individual',
    },
    false,
  );
  assert.equal(created.ok, true);
  if (!created.ok || created.rpc !== 'create_seller_profile') return;
  assert.deepEqual(created.args, {
    p_username: 'Player_01',
    p_display_name: 'Ziad',
    p_governorate_slug: 'cairo',
    p_account_type: 'individual',
  });

  const badUsername = parseProfileMutation(
    {
      intent: 'create',
      username: 'bad-name',
      display_name: 'Ziad',
      governorate_slug: 'cairo',
      account_type: 'individual',
    },
    false,
  );
  assert.deepEqual(badUsername, {
    ok: false,
    message: 'invalidFields',
    errors: { username: 'usernameHint' },
  });

  // Details require an existing profile and positive version.
  assert.deepEqual(
    parseProfileMutation({ intent: 'details', version: '1' }, false),
    { ok: false, message: 'conflict' },
  );

  const details = parseProfileMutation(
    {
      intent: 'details',
      version: '2',
      display_name: 'Updated Name',
      governorate_slug: 'giza',
      account_type: 'business',
      bio: '  Club shop  ',
      district_text: '   ',
      favorite_racket: '',
      is_public: 'on',
    },
    true,
  );
  assert.equal(details.ok, true);
  if (!details.ok || details.rpc !== 'update_seller_profile') return;
  assert.equal(details.args.p_expected_version, 2);
  assert.equal(details.args.p_patch.bio, 'Club shop');
  assert.equal(details.args.p_patch.district_text, null);
  assert.equal(details.args.p_patch.is_public, true);

  // Contact rejects consent without a phone number and malformed E.164 numbers.
  assert.deepEqual(
    parseProfileMutation(
      {
        intent: 'contact',
        version: '2',
        contact_version: '1',
        whatsapp_e164: '',
        public_contact_consent: 'on',
      },
      true,
    ),
    {
      ok: false,
      message: 'invalidFields',
      errors: { whatsapp_e164: 'phoneHint' },
    },
  );

  const contact = parseProfileMutation(
    {
      intent: 'contact',
      version: '2',
      contact_version: '1',
      whatsapp_e164: ' +201000000000 ',
      public_contact_consent: 'on',
    },
    true,
  );
  assert.equal(contact.ok, true);
  if (!contact.ok || contact.rpc !== 'update_my_contact') return;
  assert.deepEqual(contact.args, {
    p_expected_profile_version: 2,
    p_expected_contact_version: 1,
    p_whatsapp_e164: '+201000000000',
    p_public_contact_consent: true,
  });
});

test('parseProfileBundle strips private user_id while preserving owner DTO fields', () => {
  const parsed = parseProfileBundle({
    user_id: '11111111-1111-4111-8111-111111111111',
    public_id: '22222222-2222-4222-8222-222222222222',
    username: 'omar_padel',
    display_name: 'Omar',
    governorate_slug: 'cairo',
    account_type: 'individual',
    bio: null,
    district_text: 'Maadi',
    favorite_racket: null,
    is_public: false,
    account_status: 'active',
    version: 1,
    contact_version: 1,
    whatsapp_e164: null,
    public_contact_consent: false,
  });

  assert.ok(parsed);
  assert.equal(parsed.username, 'omar_padel');
  assert.equal('user_id' in parsed, false);
});

test('mapProfileRpcError maps conflicts, duplicate usernames and suspension cleanly', () => {
  assert.deepEqual(mapProfileRpcError({ code: 'PT409' }), { message: 'conflict' });
  assert.deepEqual(mapProfileRpcError({ code: '23505' }), {
    message: 'usernameUnavailable',
    errors: { username: 'usernameUnavailable' },
  });
  assert.deepEqual(mapProfileRpcError({ code: '42501' }), { message: 'notAllowed' });
  assert.deepEqual(mapProfileRpcError({ code: '50000' }), { message: 'saveFailed' });
});

test('auth credential validation and error mapping match signup/signin policies', () => {
  const signupForm = new FormData();
  signupForm.set('email', '  player@example.com  ');
  signupForm.set('password', 'short');
  const shortSignup = parseAuthCredentials('signup', signupForm);
  assert.equal(shortSignup.ok, false);
  if (!shortSignup.ok) {
    assert.equal(shortSignup.email, 'player@example.com');
    assert.deepEqual(shortSignup.errors, { password: 'passwordInvalid' });
  }

  const signinForm = new FormData();
  signinForm.set('email', 'player@example.com');
  signinForm.set('password', 'x');
  assert.deepEqual(parseAuthCredentials('signin', signinForm), {
    ok: true,
    data: { email: 'player@example.com', password: 'x' },
  });

  assert.equal(mapAuthSignUpError({ status: 429 }), 'rateLimited');
  assert.equal(mapAuthSignUpError({ status: 400 }), 'signupFailed');
  assert.equal(mapAuthSignInError({ code: 'email_not_confirmed' }), 'confirmFirst');
  assert.equal(mapAuthSignInError({ status: 429 }), 'rateLimited');
  assert.equal(mapAuthSignInError({ code: 'invalid_credentials' }), 'signinFailed');
});
