import { MarketplacePage } from '@/features/marketplace/marketplace-page';
export default function Page(props: { searchParams: Promise<Record<string,string|string[]|undefined>> }) { return <MarketplacePage {...props} />; }
export const dynamic = 'force-dynamic';
