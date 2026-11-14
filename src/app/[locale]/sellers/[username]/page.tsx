import { notFound } from 'next/navigation';
import { SellerProfileView } from '@/features/marketplace/seller-profile-view';

export default async function SellerPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  if (username !== 'omar_padel') {
    notFound();
  }

  return <SellerProfileView />;
}
