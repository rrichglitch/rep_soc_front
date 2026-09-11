import { useEffect, useState } from 'react';
import { getRatings, giveRating } from '../utils/spacetime';
import { getOAuthSession } from '../utils/oauthSession';

const DEEP_GOLD = '#d97706'; // up to the lower of (your vote, average)
const LIGHT_GOLD = '#fbbf24'; // past it, up to the higher
const UNRATED = '#e5e7eb';

// One star: your vote fills whole stars only, the average fills fractionally.
// The lower of the two renders deep gold; the stretch to the higher renders
// light gold; the rest stays gray.
function Star({ userFill, avgFill, size }: { userFill: number; avgFill: number; size: number }) {
  const lo = Math.min(userFill, avgFill);
  const hi = Math.max(userFill, avgFill);
  const clip = (frac: number, color: string) => (
    <span
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${Math.min(Math.max(frac, 0), 1) * 100}%`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        color,
      }}
    >
      ★
    </span>
  );
  return (
    <span style={{ position: 'relative', display: 'inline-block', fontSize: size, lineHeight: 1, color: UNRATED }}>
      ★
      {hi > 0 && clip(hi, LIGHT_GOLD)}
      {lo > 0 && clip(lo, DEEP_GOLD)}
    </span>
  );
}

// Org star ratings, shown right under the org name. Click a star to vote
// (re-voting overwrites). No text, no deletion — a vote is a vote.
function Ratings({ orgIdentityHex }: { orgIdentityHex: string }) {
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [mine, setMine] = useState(0);
  const [busy, setBusy] = useState(false);
  const ownHex = getOAuthSession()?.identityHex ?? '';

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await getRatings(orgIdentityHex);
      if (!alive) return;
      setAverage(s.average);
      setCount(s.count);
      setMine(s.ratings.find((r) => r.raterIdentityHex === ownHex)?.stars ?? 0);
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orgIdentityHex, ownHex]);

  const vote = async (n: number) => {
    if (!ownHex || busy) return;
    setBusy(true);
    try {
      await giveRating(orgIdentityHex, n);
      const s = await getRatings(orgIdentityHex);
      setAverage(s.average);
      setCount(s.count);
      setMine(s.ratings.find((r) => r.raterIdentityHex === ownHex)?.stars ?? n);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="org-badge">Organization</span> {average.toFixed(1)}{' '}
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={ownHex ? () => vote(n) : undefined}
          style={{ cursor: ownHex ? 'pointer' : 'default' }}
          role={ownHex ? 'button' : undefined}
          aria-label={ownHex ? `Rate ${n} star${n > 1 ? 's' : ''}` : undefined}
        >
          <Star userFill={mine >= n ? 1 : 0} avgFill={average - (n - 1)} size={22} />
        </span>
      ))}{' '}
      ({count})
    </div>
  );
}

export default Ratings;
