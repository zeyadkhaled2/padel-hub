import { z } from 'zod';
import { nonNegativeIntSchema } from '@/lib/validation/shared';

export type OwnerMetricsSummary = {
  scope: 'owner';
  views: number;
};

export type AdminMetricsSummary = {
  scope: 'admin';
  views: number;
  contacts: number;
};

export type ListingMetricsSummary = OwnerMetricsSummary | AdminMetricsSummary;

const ownerMetricsSchema = z.object({
  views: z.coerce.number().pipe(nonNegativeIntSchema),
});

const adminMetricsSchema = z.object({
  views: z.coerce.number().pipe(nonNegativeIntSchema),
  contacts: z.coerce.number().pipe(nonNegativeIntSchema),
});

export function parseListingMetrics(raw: unknown, admin: true): AdminMetricsSummary | null;
export function parseListingMetrics(raw: unknown, admin: false): OwnerMetricsSummary | null;
export function parseListingMetrics(raw: unknown, admin: boolean): ListingMetricsSummary | null;
export function parseListingMetrics(raw: unknown, admin: boolean): ListingMetricsSummary | null {
  if (admin) {
    const parsed = adminMetricsSchema.safeParse(raw);
    return parsed.success
      ? { scope: 'admin', views: parsed.data.views, contacts: parsed.data.contacts }
      : null;
  }
  const parsed = ownerMetricsSchema.safeParse(raw);
  // Explicitly return only views for owner summaries, never forwarding contact metrics.
  return parsed.success ? { scope: 'owner', views: parsed.data.views } : null;
}
