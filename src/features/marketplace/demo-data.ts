/**
 * Illustrative content only. Never use these fixtures as production inventory.
 */
export const demoListings = [
  {
    id: 'head-delta-motion',
    name: 'Head Delta Motion',
    brand: 'Head',
    price: 4200,
    category: 'rackets',
    condition: 'used',
    color: 'sage',
  },
  {
    id: 'bullpadel-vertex-03',
    name: 'Bullpadel Vertex 03',
    brand: 'Bullpadel',
    price: 5800,
    category: 'rackets',
    condition: 'used',
    color: 'clay',
  },
  {
    id: 'head-padel-pro',
    name: 'Head Padel Pro · 3',
    brand: 'Head',
    price: 280,
    category: 'balls',
    condition: 'new',
    color: 'lime',
  },
] as const;

export type DemoListing = (typeof demoListings)[number];

export function filterDemoListings(
  query: string,
  category: string,
  sort: string,
): DemoListing[] {
  const normalized = query.trim().toLowerCase();

  const result = demoListings.filter((item) => {
    const matchesQuery = `${item.name} ${item.brand}`
      .toLowerCase()
      .includes(normalized);
    const matchesCategory =
      !['rackets', 'balls'].includes(category) || item.category === category;

    return matchesQuery && matchesCategory;
  });

  if (sort === 'low') {
    result.sort((a, b) => a.price - b.price);
  }

  if (sort === 'high') {
    result.sort((a, b) => b.price - a.price);
  }

  return result;
}
