import { useEffect, useState } from 'react';
import { getRatings, giveRating, deleteRating, type RatingsSummary } from '../utils/spacetime';
import { getOAuthSession } from '../utils/oauthSession';

interface RatingsProps {
  /** Org account identity hex (ratings are only surfaced for orgs). */
  orgIdentityHex: string;
}

function Stars({ value, onPick, size }: { value: number; onPick?: (n: number) => void; size?: number }) {
  return (
    <span style={{ fontSize: size ?? 20, letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={onPick ? () => onPick(n) : undefined}
          style={{ cursor: onPick ? 'pointer' : 'default', color: n <= Math.round(value) ? '#f59e0b' : '#d1d5db' }}
          role={onPick ? 'button' : undefined}
          aria-label={onPick ? `${n} star${n > 1 ? 's' : ''}` : undefined}
        >
          ★
        </span>
      ))}
    </span>
  );
}

// 5-star org ratings: average + count, review list, and a give/update form.
// Mounted on org profile pages only — individuals have no ratings UI.
function Ratings({ orgIdentityHex }: RatingsProps) {
  const [summary, setSummary] = useState<RatingsSummary>({ count: 0, average: 0, ratings: [] });
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownHex = getOAuthSession()?.identityHex ?? '';

  const refresh = async () => {
    setSummary(await getRatings(orgIdentityHex));
  };

  useEffect(() => {
    let alive = true;
    getRatings(orgIdentityHex).then((s) => { if (alive) setSummary(s); });
    const interval = setInterval(() => {
      getRatings(orgIdentityHex).then((s) => { if (alive) setSummary(s); });
    }, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [orgIdentityHex]);

  // Prefill the form with the viewer's existing rating, if any.
  useEffect(() => {
    const mine = summary.ratings.find((r) => r.raterIdentityHex === ownHex);
    if (mine) {
      setStars(mine.stars);
      setText(mine.text);
    }
  }, [summary, ownHex]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await giveRating(orgIdentityHex, stars, text.trim());
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Could not save rating');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteRating(orgIdentityHex);
      setStars(5);
      setText('');
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete rating');
    } finally {
      setBusy(false);
    }
  };

  const mine = summary.ratings.find((r) => r.raterIdentityHex === ownHex);

  return (
    <section>
      <h3>Ratings</h3>
      {summary.count === 0 ? (
        <p>No ratings yet — be the first.</p>
      ) : (
        <p>
          <Stars value={summary.average} /> {summary.average.toFixed(1)} · {summary.count} rating{summary.count === 1 ? '' : 's'}
        </p>
      )}

      <form onSubmit={submit}>
        <Stars value={stars} onPick={setStars} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a review (optional)…"
          maxLength={500}
          rows={2}
        />
        <div>
          <button type="submit" disabled={busy}>
            {mine ? 'Update rating' : 'Rate'}
          </button>
          {mine && (
            <button type="button" onClick={remove} disabled={busy}>
              Remove
            </button>
          )}
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>

      <ul>
        {summary.ratings.map((r) => (
          <li key={r.raterIdentityHex}>
            <Stars value={r.stars} size={14} />{' '}
            {r.text && <span>{r.text}</span>}{' '}
            <small>{r.createdAt.toLocaleDateString()}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default Ratings;
