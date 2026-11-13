import type { DemoListing } from './demo-data';

export function EquipmentArt({ listing, label }: { listing: DemoListing; label: string }) {
  return <div className={`equipment-art art-${listing.color}`} role="img" aria-label={label}>
    <div className="court-line court-line-one" /><div className="court-line court-line-two" />
    {listing.category === 'balls' ? <div className="ball-tube"><span>PADEL</span><div className="ball" /><div className="ball" /><span>PRO · 3</span></div> :
      <div className="racket"><div className="racket-face"><span className="racket-brand">{listing.brand}</span></div><div className="racket-neck" /><div className="racket-grip" /></div>}
  </div>;
}
