import { ProfilePage } from '@/features/profile/profile-page';
import { accountMetadata } from '@/features/auth/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { return accountMetadata((await params).locale, 'title'); }
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ProfilePage locale={(await params).locale} />;
}
