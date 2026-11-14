import Image from 'next/image';
import type { DemoListing } from './demo-data';

interface EquipmentArtProps {
  listing: DemoListing;
  label: string;
  hero?: boolean;
}

/**
 * Generated, unbranded illustrations; never evidence of a demo item's appearance.
 */
export function EquipmentArt({
  listing,
  label,
  hero = false,
}: EquipmentArtProps) {
  const source =
    listing.category === 'balls'
      ? 'balls'
      : listing.color === 'clay'
        ? 'racket-coral'
        : 'racket-court';

  return (
    <div className="equipment-art">
      <Image
        src={`/images/demo/${source}.webp`}
        alt={label}
        fill
        sizes="(max-width: 700px) 100vw, 50vw"
        preload={hero}
      />
    </div>
  );
}
