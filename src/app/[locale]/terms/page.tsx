import { legalMetadata, LegalPage } from '@/features/legal/legal-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return legalMetadata((await params).locale, 'terms');
}

export default async function TermsOfUsePage() {
  return <LegalPage kind="terms" />;
}
