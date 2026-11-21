import { AuthPage } from '@/features/auth/auth-page';
import { accountMetadata } from '@/features/auth/metadata';
import { parseAuthBannerNotice } from '@/features/auth/validation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return accountMetadata((await params).locale, 'signin');
}

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return (
    <AuthPage
      locale={locale}
      mode="signin"
      bannerNotice={parseAuthBannerNotice(query)}
    />
  );
}
