import { notFound } from 'next/navigation';
import { demoListings } from '@/features/marketplace/demo-data';
import { EquipmentDetailView } from '@/features/marketplace/equipment-detail-view';

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = demoListings.find((item) => item.id === id);

  if (!listing) {
    notFound();
  }

  return <EquipmentDetailView listing={listing} />;
}
