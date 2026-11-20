export type AuthMode = 'signin' | 'signup';

export type AuthMessage =
  | 'unavailable'
  | 'rateLimited'
  | 'signupFailed'
  | 'signinFailed'
  | 'confirmFirst'
  | 'checkEmail';

export type AuthFieldErrors = Partial<{
  email: 'emailInvalid';
  password: 'passwordInvalid';
}>;

export type FormState = {
  message?: AuthMessage;
  errors?: AuthFieldErrors;
  email?: string;
};

export const localeValue = (value: string): 'en' | 'ar' => (value === 'ar' ? 'ar' : 'en');
