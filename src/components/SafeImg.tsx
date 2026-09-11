import { useState } from 'react';

// <img> with lazy loading + bounded retry. Search cards fire up to 150 image
// loads at once; mobile browsers fail a random subset under that pressure,
// and with no handler the failures stuck until refresh. Retry heals them.
export default function SafeImg({
  src,
  alt,
  className,
  placeholder,
}: {
  src: string;
  alt: string;
  className: string;
  // Rendered when src is empty or all retries fail.
  placeholder: React.ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [dead, setDead] = useState(false);

  if (!src || dead) return <>{placeholder}</>;

  // Cache-bust remote retries so a poisoned cache entry isn't re-read;
  // data-URL thumbnails are just re-set.
  const effSrc =
    attempt > 0 && !src.startsWith('data:')
      ? `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`
      : src;

  return (
    <img
      src={effSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (attempt < 2) {
          setTimeout(() => setAttempt((a) => a + 1), 400 * (attempt + 1));
        } else {
          setDead(true);
        }
      }}
    />
  );
}
