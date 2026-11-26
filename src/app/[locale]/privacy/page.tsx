import { legalMetadata, LegalPage } from '@/features/legal/legal-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return legalMetadata((await params).locale, 'privacy');
}

export default async function PrivacyPolicyPage() {
  return <LegalPage kind="privacy" />;
}
