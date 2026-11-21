import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { accountMetadata } from '@/features/auth/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return accountMetadata((await params).locale, 'forgotPassword');
}

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ForgotPasswordPage locale={(await params).locale} />;
}
