'use client';

/* eslint-disable @next/next/no-img-element -- Authorization must run on every private preview request. */
import { useState } from 'react';

export function AdminPhotoPreview({ src, alt, fallback, thumbnail = false }: {
  src: string; alt: string; fallback: string; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="inventory-no-photo">{fallback}</span>;
  return <img src={src} alt={alt} width={thumbnail ? 64 : 640} height={thumbnail ? 64 : 480}
    loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
