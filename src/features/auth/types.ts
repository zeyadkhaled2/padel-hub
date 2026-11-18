export type FormState = { message?: string; errors?: Record<string, string>; email?: string };
export const localeValue = (value: string) => value === 'ar' ? 'ar' : 'en';
