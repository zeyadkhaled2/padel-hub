import { accountMetadata } from '@/features/auth/metadata';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return accountMetadata((await params).locale, 'resetPassword');
}

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return <ResetPasswordPage invalidLink={query.error === 'invalid'} />;
}
