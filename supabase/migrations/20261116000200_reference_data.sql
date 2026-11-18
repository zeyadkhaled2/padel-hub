-- Canonical reference data only; no marketplace/demo accounts or inventory.
begin;
insert into public.platform_settings(id) values(true);
insert into public.egypt_governorates(slug,name_en,name_ar,sort_order) values
 ('cairo','Cairo','القاهرة',1),('giza','Giza','الجيزة',2),('alexandria','Alexandria','الإسكندرية',3),
 ('dakahlia','Dakahlia','الدقهلية',4),('red_sea','Red Sea','البحر الأحمر',5),('beheira','Beheira','البحيرة',6),
 ('fayoum','Fayoum','الفيوم',7),('gharbia','Gharbia','الغربية',8),('ismailia','Ismailia','الإسماعيلية',9),
 ('menoufia','Menoufia','المنوفية',10),('minya','Minya','المنيا',11),('qalyubia','Qalyubia','القليوبية',12),
 ('new_valley','New Valley','الوادي الجديد',13),('suez','Suez','السويس',14),('aswan','Aswan','أسوان',15),
 ('assiut','Assiut','أسيوط',16),('beni_suef','Beni Suef','بني سويف',17),('port_said','Port Said','بورسعيد',18),
 ('damietta','Damietta','دمياط',19),('sharqia','Sharqia','الشرقية',20),('south_sinai','South Sinai','جنوب سيناء',21),
 ('kafr_el_sheikh','Kafr El Sheikh','كفر الشيخ',22),('matrouh','Matrouh','مطروح',23),('luxor','Luxor','الأقصر',24),
 ('qena','Qena','قنا',25),('north_sinai','North Sinai','شمال سيناء',26),('sohag','Sohag','سوهاج',27);
-- Support flags are a conservative initial reference set; admin curation comes later.
insert into public.curated_brands(slug,display_name,supports_balls,is_other,sort_order) values
 ('adidas','adidas',true,false,1),('babolat','Babolat',true,false,2),('bullpadel','Bullpadel',true,false,3),
 ('head','HEAD',true,false,4),('nox','NOX',true,false,5),('siux','Siux',true,false,6),
 ('starvie','StarVie',false,false,7),('wilson','Wilson',true,false,8),('varlion','Varlion',false,false,9),
 ('kuikma','Kuikma',true,false,10),('drop_shot','Drop Shot',false,false,11),('royal_padel','Royal Padel',false,false,12),
 ('technical','Technical',false,false,13),('other','Other',true,true,14);
insert into public.username_registry(username_lower,kind)
select unnest(array['admin','administrator','mod','moderator','staff','support','help','system','root','api','auth','login','logout','signin','signup','register','callback','oauth','reset','password','verify','verification','mfa','session','about','equipment','listing','listings','racket','rackets','ball','balls','seller','sellers','profile','profiles','account','accounts','dashboard','settings','moderation','report','reports','search','explore','home','index','privacy','terms','rules','guidelines','contact','whatsapp','health','status','padelhub','padel_hub','official','verified','vercel','supabase','nextjs','null','undefined','test','demo','static','_next','www','mail','smtp']), 'reserved';
commit;
