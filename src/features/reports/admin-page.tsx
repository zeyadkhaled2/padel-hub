import { getTranslations } from 'next-intl/server';
import { notFound,redirect } from 'next/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { Link } from '@/i18n/navigation';
import { ResolveForm } from './forms';

export default async function ReportsPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string;done?:string}>}) {
 const {locale}=await params,query=await searchParams,t=await getTranslations('reports');
 const client=await verifiedClient(); if(!client) redirect(`/${locale}/auth/signin`);
 const access=await client.rpc('get_my_admin_access');
 if(access.error) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p></main>;
 if(!access.data?.is_admin) notFound(); if(!access.data.mfa_verified) redirect(`/${locale}/admin`);
 const page=query.page===undefined?1:Number(query.page); if(!Number.isInteger(page)||page<1||page>10000) notFound();
 const result=await client.rpc('admin_reports',{p_page:page});
 return <main id="main" className="container account-page"><Link href="/admin">{t('admin')}</Link><h1>{t('queue')}</h1>
 {query.done==='1' && <p role="status">{t('resolved')}</p>}
 {result.error?<p role="alert">{t('unavailable')}</p>:<><p>{t('count',{count:result.data.total})}</p>
 {result.data.items.map((item:{id:string;version:number;target_version:number;target_type:string;title:string|null;username:string;listing_id:string|null;reason_code:string;details:string})=><section key={item.id} className="disclosure">
 <h2><bdi>{item.title || `@${item.username}`}</bdi></h2><p>{t(item.reason_code)}</p><p className="user-copy">{item.details}</p>
 <Link href={item.target_type==='listing'?`/equipment/${item.listing_id}`:`/@${item.username}`} target="_blank" rel="noreferrer">{t('view')}</Link>
 <ResolveForm id={item.id} version={item.version} targetVersion={item.target_version} type={item.target_type}/>
 </section>)}
 <nav aria-label={t('pages')}>{page>1&&<Link href={`/admin/reports?page=${page-1}`}>{t('previous')}</Link>}{' '}{page*24<result.data.total&&<Link href={`/admin/reports?page=${page+1}`}>{t('next')}</Link>}</nav></>}
 </main>;
}
