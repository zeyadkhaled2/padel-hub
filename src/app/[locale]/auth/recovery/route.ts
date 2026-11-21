import { NextRequest } from 'next/server';
import { handleRecoveryVerification } from '@/features/auth/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  return handleRecoveryVerification(request, (await params).locale);
}
