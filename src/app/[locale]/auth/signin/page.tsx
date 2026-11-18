import { AuthPage } from '@/features/auth/auth-page';
import { accountMetadata } from '@/features/auth/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { return accountMetadata((await params).locale, 'signin'); }
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  return <AuthPage locale={(await params).locale} mode="signin" callbackError={!!(await searchParams).error} />;
}
