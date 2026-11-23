'use client';

import { useState } from 'react';

/** Encodes a logo as JPEG on a white background so transparent PNGs stay readable. */
export async function encodeLogo(file: File) {
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('photoError');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('photoError');
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('photoError');
    for (const width of [400, 300, 200]) {
      const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      if (encoded && encoded.length <= 95000) return encoded;
    }
    throw new Error('photoError');
  } finally {
    bitmap.close();
  }
}

/** Encodes a wide brand background as JPEG, shrinking until it fits the upload limit. */
export async function encodeBackground(file: File) {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('photoError');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('photoError');
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('photoError');
    for (const [width, quality] of [
      [1600, 0.82],
      [1280, 0.8],
      [1024, 0.75],
      [800, 0.7],
    ]) {
      const scale = Math.min(1, width / bitmap.width);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (encoded && encoded.length <= 280000) return encoded;
    }
    throw new Error('photoError');
  } finally {
    bitmap.close();
  }
}

export function brandBackgroundUrl(coachId: string, backgroundAt: string | Date) {
  return `/api/branding/background?coachId=${encodeURIComponent(coachId)}&v=${+new Date(backgroundAt)}`;
}

export function brandLogoUrl(coachId: string, logoAt: string | Date) {
  return `/api/branding/logo?coachId=${encodeURIComponent(coachId)}&v=${+new Date(logoAt)}`;
}

/** The coach's logo, or their initials on the brand color when there is no logo. */
export function BrandMark({
  coachId,
  name,
  branding,
  className = 'avatar',
}: {
  coachId: string;
  name: string;
  branding?: { color?: string; logoAt?: string | Date | null } | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  if (branding?.logoAt && !failed)
    return (
      <span className={`${className} brand-mark has-logo`} aria-hidden="true">
        <img src={brandLogoUrl(coachId, branding.logoAt)} alt="" onError={() => setFailed(true)} />
      </span>
    );
  return (
    <span
      className={`${className} brand-mark`}
      aria-hidden="true"
      style={branding?.color ? { background: branding.color, color: '#fff' } : undefined}
    >
      {initials}
    </span>
  );
}
