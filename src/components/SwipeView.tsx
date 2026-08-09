import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checkIsFollowing, followUser, sendFriendRequest, getFriendRequestStatus, checkIsFriend,
} from '../utils/spacetime';

export interface SwipeResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  email: string;
  fullName: string;
  profilePicture: string;
  city: string;
  description: string;
}

interface SwipeViewProps {
  results: SwipeResult[];
  myIdentity: string;     // hex identity of the viewer
  activeOrgId?: bigint;   // when signed in as an org, follow acts as the org
  isDesktop: boolean;
  onIndexChange?: (index: number) => void;
}

// Tinder/Bumble-style browsing: full-bleed profile previews, swipe (or
// horizontal scroll) to move between them, ‹ › carrots and peek cards on desktop.
function SwipeView({ results, myIdentity, activeOrgId, isDesktop, onIndexChange }: SwipeViewProps) {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const [cardW, setCardW] = useState(0);
  const [contW, setContW] = useState(0);
  const [index, setIndex] = useState(0);
  const [infoH, setInfoH] = useState(0);
  const [scrim, setScrim] = useState(0.25); // 25% base → 40% when fully scrolled
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({});
  const [friendStates, setFriendStates] = useState<Record<string, 'none' | 'pending' | 'friends'>>({});
  const infoRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Reset position when the result set changes
  useEffect(() => {
    setIndex(0);
    setScrim(0.25);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [results]);

  useEffect(() => { onIndexChange?.(index); }, [index, onIndexChange]);

  // Measure card width: desktop shows peek cards on both sides, mobile is full-bleed
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const w = trackRef.current.clientWidth;
      setContW(w);
      setCardW(isDesktop ? Math.min(520, Math.round(w * 0.72)) : w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop]);

  // Measure the info block height (drives the scrim solid/fade split)
  useEffect(() => {
    if (!infoRef.current) return;
    const measure = () => setInfoH(infoRef.current?.offsetHeight || 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(infoRef.current);
    return () => ro.disconnect();
  }, [index, results]);

  // Follow + friend status polling for the current card
  const current = results[index];
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const refresh = async () => {
      if (current.type === 'person') {
        try {
          const f = await checkIsFollowing(current.identity, myIdentity);
          if (alive) setFollowStates((s) => ({ ...s, [current.identity]: f }));
        } catch { /* ignore */ }
        setFriendStates((s) => ({
          ...s,
          [current.identity]: checkIsFriend(myIdentity, current.identity)
            ? 'friends'
            : getFriendRequestStatus(myIdentity, current.identity) === 'pending'
              ? 'pending' : 'none',
        }));
      } else {
        try {
          const f = await checkIsFollowing(current.identity, myIdentity);
          if (alive) setFollowStates((s) => ({ ...s, [current.identity]: f }));
        } catch { /* ignore */ }
      }
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [current?.identity, myIdentity, activeOrgId]);

  // Scroll → current index (scroll-snap aligns cards to the start edge)
  const onScroll = useCallback(() => {
    if (!trackRef.current || cardW === 0) return;
    const i = Math.round(trackRef.current.scrollLeft / cardW);
    if (i !== index && i >= 0 && i < results.length) {
      setIndex(i);
      setScrim(0.25);
      if (descRef.current) descRef.current.scrollTop = 0;
    }
  }, [cardW, index, results.length]);

  // Description scroll → scrim opacity 25% → 40% at full scroll
  const onDescScroll = () => {
    const el = descRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const progress = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
    setScrim(0.25 + progress * 0.15);
  };

  // Desktop: vertical wheel over the card background pans horizontally.
  // The description keeps its own vertical scroll.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !isDesktop) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.swipe-desc')) return; // let the description scroll
      // Only vertical wheel input converts to horizontal paging; native
      // horizontal input (trackpad swipe) scrolls on its own.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isDesktop, cardW]);

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(results.length - 1, i));
    trackRef.current?.scrollTo({ left: clamped * cardW, behavior: 'smooth' });
    setIndex(clamped);
  };

  const openProfile = (r: SwipeResult) => {
    navigate(r.type === 'org' ? `/org/${r.orgId}` : `/profile/${r.identity}`);
  };

  // Tap anywhere on the card opens the profile (drags and buttons excluded)
  const handleCardTap = (r: SwipeResult) => (e: React.MouseEvent) => {
    const t = tapStartRef.current;
    if (!t) return;
    if (Math.abs(e.clientX - t.x) > 12 || Math.abs(e.clientY - t.y) > 12) return; // it was a drag
    if (Date.now() - t.t > 600) return; // long-press style drags
    openProfile(r);
  };

  const toggleFollow = async (r: SwipeResult) => {
    const was = followStates[r.identity];
    setFollowStates((s) => ({ ...s, [r.identity]: !was }));
    try {
      await followUser(r.identity, activeOrgId);
    } catch (err: any) {
      alert(err?.message || 'Failed to follow');
      setFollowStates((s) => ({ ...s, [r.identity]: was }));
    }
  };

  const sendFriend = async (r: SwipeResult) => {
    if (friendStates[r.identity] !== 'none') return;
    setFriendStates((s) => ({ ...s, [r.identity]: 'pending' }));
    try {
      await sendFriendRequest(r.identity, activeOrgId);
    } catch (err: any) {
      alert(err?.message || 'Failed to send friend request');
      setFriendStates((s) => ({ ...s, [r.identity]: 'none' }));
    }
  };

  const sc = scrim.toFixed(2);
  const scrimBg = (fade: boolean) =>
    fade
      ? `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,${sc}) 100%)`
      : `rgba(0,0,0,${sc})`;

  if (results.length === 0) return null;

  return (
    <div className="swipe-stage">
      {isDesktop && (
        <>
          <button className="swipe-carrot swipe-prev" onClick={() => goTo(index - 1)} aria-label="Previous">‹</button>
          <button className="swipe-carrot swipe-next" onClick={() => goTo(index + 1)} aria-label="Next">›</button>
        </>
      )}
      <div
        className="swipe-track"
        ref={trackRef}
        onScroll={onScroll}
        style={isDesktop && contW > cardW ? {
          padding: `0 ${Math.round((contW - cardW) / 2)}px`,
          scrollPaddingLeft: Math.round((contW - cardW) / 2),
          scrollPaddingRight: Math.round((contW - cardW) / 2),
        } : undefined}
      >
        {results.map((r, i) => (
          <div
            key={r.type === 'org' ? `org-${r.orgId}` : r.identity}
            className={`swipe-card ${i === index ? 'current' : 'dim'}`}
            style={{ width: cardW || undefined }}
            onPointerDown={(e) => { tapStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }; }}
            onClick={handleCardTap(r)}
          >
            {r.profilePicture ? (
              <img src={r.profilePicture} alt={r.fullName} className="swipe-bg" draggable={false} />
            ) : (
              <div className="swipe-bg-placeholder" />
            )}
            <div className="swipe-scrim-fade" style={{ bottom: infoH || undefined, background: scrimBg(true) }} />
            <div className="swipe-scrim-solid" style={{ height: infoH || undefined, background: scrimBg(false) }} />
            <div className="swipe-info" ref={i === index ? infoRef : undefined} style={{ minHeight: '25%' }}>
              <h2 className="swipe-name">
                {r.fullName}
                {r.type === 'org' && <span className="swipe-org-badge">Organization</span>}
              </h2>
              {r.city && <p className="swipe-city">{r.city}</p>}
              <div
                className="swipe-desc"
                ref={i === index ? descRef : undefined}
                onScroll={i === index ? onDescScroll : undefined}
              >
                {r.description || 'No description yet.'}
              </div>
              <div className="swipe-actions">
                <button
                  className={`swipe-follow ${followStates[r.identity] ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFollow(r); }}
                >
                  {followStates[r.identity] ? 'Following' : 'Follow'}
                </button>
                {r.type === 'person' && (
                  <button
                    className={`swipe-friend ${friendStates[r.identity] === 'pending' || friendStates[r.identity] === 'friends' ? 'active' : ''}`}
                    disabled={friendStates[r.identity] !== 'none'}
                    onClick={(e) => { e.stopPropagation(); sendFriend(r); }}
                  >
                    {friendStates[r.identity] === 'friends' ? 'Friends' : friendStates[r.identity] === 'pending' ? 'Requested' : 'Add Friend'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .swipe-stage { position: absolute; inset: 0; overflow: hidden; background: #111; }
        .swipe-track {
          display: flex; height: 100%; overflow-x: auto; scroll-snap-type: x proximity;
          scrollbar-width: none; -ms-overflow-style: none; box-sizing: border-box;
        }
        .swipe-track::-webkit-scrollbar { display: none; }
        .swipe-card {
          position: relative; flex: 0 0 auto; height: 100%; scroll-snap-align: start;
          overflow: hidden; cursor: pointer; transition: opacity 0.2s;
        }
        .swipe-card.dim { opacity: 0.45; }
        .swipe-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none; }
        .swipe-bg-placeholder { position: absolute; inset: 0; background: linear-gradient(135deg, #334155, #1e293b); }
        .swipe-scrim-fade {
          position: absolute; left: 0; right: 0; height: 25%; pointer-events: none;
        }
        .swipe-scrim-solid { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: none; }
        .swipe-info {
          position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box;
          display: flex; flex-direction: column; padding: 16px 20px 24px; color: white;
        }
        .swipe-name { margin: 0 0 2px; font-size: 28px; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .swipe-org-badge {
          display: inline-block; margin-left: 8px; padding: 2px 10px; font-size: 11px; font-weight: 600;
          background: rgba(102,126,234,0.9); border-radius: 20px; vertical-align: middle;
        }
        .swipe-city { margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,0.85); }
        .swipe-desc {
          max-height: 30vh; overflow-y: auto; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.92);
          overscroll-behavior: contain; scrollbar-width: thin;
        }
        .swipe-desc::-webkit-scrollbar { width: 4px; }
        .swipe-desc::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.4); border-radius: 2px; }
        .swipe-actions { display: flex; gap: 10px; margin-top: 14px; }
        .swipe-follow, .swipe-friend {
          padding: 10px 24px; border-radius: 24px; font-size: 15px; font-weight: 600; cursor: pointer;
          border: none; transition: background 0.15s, color 0.15s, opacity 0.15s;
        }
        .swipe-follow { background: white; color: #667eea; }
        .swipe-follow.active { background: #667eea; color: white; }
        .swipe-friend { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.5); }
        .swipe-friend.active { background: #22c55e; border-color: #22c55e; }
        .swipe-friend:disabled { opacity: 0.8; cursor: default; }
        .swipe-carrot {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 5;
          width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
          background: rgba(255,255,255,0.9); color: #333; font-size: 24px; line-height: 1;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
        }
        .swipe-carrot:hover { background: white; }
        .swipe-prev { left: 14px; }
        .swipe-next { right: 14px; }
        @media (max-width: 767px) {
          .swipe-desc { max-height: 26vh; }
        }
      `}</style>
    </div>
  );
}

export default SwipeView;
