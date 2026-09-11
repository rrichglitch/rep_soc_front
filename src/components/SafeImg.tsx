import { useEffect, useState } from 'react';

// <img> with bounded retry. Search cards fire up to 150 image loads at once
// and mobile browsers fail a random subset under that pressure; retry heals
// them. NOTE: no loading="lazy" — lazy below-fold cards render as empty
// space, which reads as broken images. The relay serves 10KB thumbs in
// ~80ms, so eager is cheap and correct.
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

  // Fresh src = fresh state. Without this, a re-used card instance kept a
  // previous dead/attempt state and gave up on the new image immediately.
  useEffect(() => {
    setAttempt(0);
    setDead(false);
  }, [src]);

  if (!src || dead) return <>{placeholder}</>;

  // Retry the SAME url so the browser revalidates its cache (cheap 304)
  // instead of re-downloading. NOTE: no cache-busting query param — during
  // a 429 storm every retry must stay conditional, or retries multiply the
  // very traffic the server is shedding (that's what turned a few transient
  // mobile failures into hundreds of rejections).
  const effSrc = src;

  return (
    <img
      src={effSrc}
      alt={alt}
      className={className}
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
