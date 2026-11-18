import { deliverPhoto } from '@/features/photos/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request:Request, {params}:{params:Promise<{id:string;media:string}>}) {
  const {id,media} = await params;
  return deliverPhoto(request,media,id);
}
export const HEAD = GET;
