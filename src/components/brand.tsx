import Image from 'next/image';

export function Brand() {
  return <span className="wordmark"><Image src="/brand/padelhub-mark.svg" alt="" width={42} height={42} /><span>padel<span className="brand-hub">hub</span><span className="brand-period">.</span></span></span>;
}
