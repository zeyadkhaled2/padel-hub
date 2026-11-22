import { BrandLogo, type BrandLogoProps } from './brand-logo';

export { BrandLogo };
export type { BrandLogoProps };

export function Brand(props: BrandLogoProps) {
  return <BrandLogo {...props} />;
}
