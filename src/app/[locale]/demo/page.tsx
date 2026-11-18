import { MarketplacePage } from '@/features/marketplace/marketplace-page';
export default function DemoPage(props: { searchParams: Promise<Record<string,string|string[]|undefined>> }) { return <MarketplacePage {...props} demo />; }
