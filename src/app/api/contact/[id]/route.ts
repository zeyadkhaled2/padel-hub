import { contact } from '@/features/marketplace/contact';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{id: string}> }) {
  return contact(request, (await params).id);
}
