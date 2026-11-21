export type AuthMode = 'signin' | 'signup';

export type AuthMessage =
  | 'unavailable'
  | 'rateLimited'
  | 'signupFailed'
  | 'signinFailed'
  | 'confirmFirst'
  | 'checkEmail'
  | 'googleUnavailable'
  | 'oauthFailed';

export type AuthBannerNotice =
  | { kind: 'status'; message: 'passwordUpdated' }
  | { kind: 'alert'; message: 'callbackFailed' | 'oauthCancelled' | 'oauthFailed' };

export type AuthFieldErrors = Partial<{
  email: 'emailInvalid';
  password: 'passwordInvalid';
}>;

export type FormState = {
  message?: AuthMessage;
  errors?: AuthFieldErrors;
  email?: string;
};

export type GoogleAuthState = {
  message?: 'unavailable' | 'googleUnavailable' | 'oauthFailed';
};

export type ForgotPasswordMessage = 'unavailable' | 'rateLimited' | 'resetEmailSent';

export type ForgotPasswordState = {
  message?: ForgotPasswordMessage;
  errors?: Partial<{ email: 'emailInvalid' }>;
  email?: string;
};

export type ResetPasswordMessage =
  | 'unavailable'
  | 'rateLimited'
  | 'recoverySessionMissing'
  | 'mfaRequiredForReset'
  | 'mfaCodeInvalid'
  | 'passwordSame'
  | 'passwordWeak'
  | 'resetFailed';

export type ResetPasswordFieldErrors = Partial<{
  password: 'passwordInvalid';
  confirmPassword: 'passwordMismatch';
  code: 'mfaCodeInvalid';
}>;

export type ResetPasswordState = {
  message?: ResetPasswordMessage;
  errors?: ResetPasswordFieldErrors;
};

export type RecoveryMfaState = {
  message?: 'unavailable' | 'recoverySessionMissing' | 'mfaCodeInvalid';
};

export const localeValue = (value: string): 'en' | 'ar' => (value === 'ar' ? 'ar' : 'en');
