import { AuthPage } from '@/features/auth/auth-page';
import { accountMetadata } from '@/features/auth/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { return accountMetadata((await params).locale, 'signup'); }
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <AuthPage locale={(await params).locale} mode="signup" />;
}
