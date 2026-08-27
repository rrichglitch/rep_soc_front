import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { useApp } from '../App';
import { isSignedIn } from '../utils/authState';
import { getProfileByEmail, getDbConnection, cancelProSubscription } from '../utils/spacetime';
import { requestCheckout, cancelSubscriptionViaStripe } from '../utils/payments';

function UpgradeProPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = useApp();
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [sub, setSub] = useState<{ active: boolean; amountCents: number; billingPeriod: string; nextBillDate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [myIdentity, setMyIdentity] = useState('');

  const sessionId = new URLSearchParams(location.search).get('session_id');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const who = email || '';
      if (!who) { setIsPro(false); return; }
      try {
        const p = await getProfileByEmail(who);
        if (!alive) return;
        setIsPro(!!p?.isPro);
        if (p?.identity) setMyIdentity(p.identity.toHexString());
        const db = getDbConnection();
        if (db) {
          try {
            const rows: any[] = [];
            for (const r of (db as any).db.myProSubscription.iter()) rows.push(r);
            const s = rows[0];
            if (s) {
              setSub({
                active: !!s.active,
                amountCents: Number(s.amountCents ?? s.amount_cents ?? 0),
                billingPeriod: s.billingPeriod || s.billing_period || 'monthly',
                nextBillDate: s.nextBillDate || s.next_bill_date || '',
              });
            }
          } catch {}
        }
      } catch {
        if (alive) setIsPro(false);
      }
    };
    load();
    // Refresh when the subscription cache settles
    const t = setTimeout(load, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [email]);

  // Returning from Stripe Checkout: poll until the webhook flips the
  // subscription active, then drop the ?session_id= from the URL.
  useEffect(() => {
    if (!sessionId) return;
    setConfirming(true);
    let alive = true;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const who = email || '';
      if (who) {
        try {
          const p = await getProfileByEmail(who);
          if (alive && p?.isPro) {
            setConfirming(false);
            window.history.replaceState({}, '', '/upgrade');
            return;
          }
        } catch {}
      }
      if (tries >= 24) { // ~60s of polling
        if (alive) {
          setConfirming(false);
          window.history.replaceState({}, '', '/upgrade');
        }
        return;
      }
      setTimeout(poll, 2500);
    };
    setTimeout(poll, 2500);
    return () => { alive = false; };
  }, [sessionId, email]);

  const isActive = isPro === true && sub?.active !== false && !cancelled;

  const handleCancel = async () => {
    setBusy(true);
    try {
      if (myIdentity) {
        try {
          await cancelSubscriptionViaStripe(myIdentity);
          setCancelled(true);
          setBusy(false);
          return;
        } catch (e: any) {
          if (e?.status !== 404) throw e;
          // No Stripe subscription on file (legacy free trial) — cancel locally.
        }
      }
      await cancelProSubscription();
      setCancelled(true);
      setIsPro(false);
      setSub((s) => (s ? { ...s, active: false } : s));
    } catch (e: any) {
      alert(e?.message || 'Failed to cancel. Please try again.');
    } finally {
      if (busy) setBusy(false);
    }
  };

  const handleUpgrade = async () => {
    setBusy(true);
    try {
      const who = email || '';
      if (!who) throw new Error('Not signed in');
      let identity = myIdentity;
      if (!identity) {
        const p = await getProfileByEmail(who);
        identity = p?.identity?.toHexString() || '';
        if (identity) setMyIdentity(identity);
      }
      if (!identity) throw new Error('Could not resolve your account identity');
      const { url } = await requestCheckout('pro', identity, who);
      window.location.assign(url);
    } catch (e: any) {
      alert(e?.message || 'Failed to start checkout. Please try again.');
      setBusy(false);
    }
  };

  const amount = sub?.amountCents ? `$${(sub.amountCents / 100).toFixed(2)}` : '$10.00';
  const period = sub?.billingPeriod === 'monthly' ? 'month' : sub?.billingPeriod || 'month';
  const billDate = sub?.nextBillDate
    ? new Date(sub.nextBillDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="upgrade-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="back-btn">← Back</button>}
        center={<span className="upgrade-title">Veri Pro</span>}
        right={<Link to={isSignedIn() ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
      />
      <div className="upgrade-body">
        <div className="upgrade-card">
          <div className="pro-icon">★</div>
          <h2>Veri Pro</h2>

          {confirming ? (
            <>
              <p className="tagline">Confirming your payment…</p>
              <p className="sub-status"><span className="status-dot pulse" /> Waiting for Stripe</p>
              <p className="fine-print">Your Pro activates as soon as the payment is confirmed. This page updates automatically.</p>
            </>
          ) : isActive ? (
            <>
              <p className="tagline">Your subscription is active — and it's a strictly separate payment from organization claiming.</p>
              <p className="sub-status"><span className="status-dot" /> Active</p>
              {cancelled && <p className="cancelled-note">Cancellation scheduled — you keep Pro through {billDate || 'the end of this period'}.</p>}
              <ul className="benefits">
                <li>Unlimited descriptive searches</li>
                <li>Support the future of Veri Social</li>
              </ul>
              <div className="billing-box">
                <div className="bill-row"><span>Next bill</span><strong>{cancelled ? '—' : billDate}</strong></div>
                <div className="bill-row"><span>Amount</span><strong>{amount} / {period}</strong></div>
              </div>
              <button className="cancel-btn" onClick={handleCancel} disabled={busy || cancelled}>
                {busy ? 'Cancelling…' : cancelled ? 'Cancellation scheduled' : 'Cancel subscription'}
              </button>
              <p className="fine-print">You keep Pro through the end of the current billing period.</p>
            </>
          ) : (
            <>
              <p className="tagline">Unlimited descriptive searches. A strictly separate payment from organization claiming.</p>
              {cancelled && <p className="cancelled-note">Your subscription has ended.</p>}
              <ul className="benefits">
                <li>Unlimited descriptive searches</li>
                <li>Support the future of Veri Social</li>
              </ul>
              <button className="buy-btn" onClick={handleUpgrade} disabled={busy}>
                {busy ? 'Working…' : `Upgrade — ${amount} / ${period}`}
              </button>
              <p className="fine-print">${amount.replace('$', '')} per month · Cancel anytime · Secure checkout by Stripe.</p>
            </>
          )}
        </div>
      </div>
      <style>{`
        .upgrade-page { min-height: 100vh; background: #f5f5f5; }
        .back-btn { background: none; border: none; font-size: 15px; color: #667eea; cursor: pointer; }
        .upgrade-title { font-weight: 700; font-size: 16px; color: #333; }
        .topbar-logo img { height: 28px; }
        .upgrade-body { display: flex; justify-content: center; padding: 40px 16px; }
        .upgrade-card { background: white; border-radius: 16px; padding: 36px 32px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .pro-icon { font-size: 42px; background: linear-gradient(135deg, #f59e0b, #d97706); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px; }
        .upgrade-card h2 { margin: 0 0 6px; color: #222; }
        .tagline { color: #666; font-size: 14px; margin: 0 0 16px; }
        .sub-status { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #059669; font-size: 13px; font-weight: 700; border-radius: 14px; padding: 4px 12px; margin-bottom: 14px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
        .status-dot.pulse { background: #f59e0b; animation: pulse 1.2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .benefits { list-style: none; padding: 0; margin: 0 0 20px; text-align: left; }
        .benefits li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #444; }
        .benefits li:before { content: '✓'; color: #22c55e; font-weight: 700; margin-right: 10px; }
        .billing-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; margin-bottom: 18px; }
        .bill-row { display: flex; justify-content: space-between; font-size: 14px; color: #555; padding: 4px 0; }
        .bill-row strong { color: #333; }
        .buy-btn { width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .buy-btn:active { filter: brightness(0.85); }
        .buy-btn:disabled { opacity: 0.7; cursor: default; }
        .cancel-btn { width: 100%; padding: 12px; background: white; color: #dc2626; border: 1px solid #dc2626; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .cancel-btn:hover { background: #dc2626; color: white; }
        .cancel-btn:active { filter: brightness(0.85); }
        .cancel-btn:disabled { opacity: 0.7; cursor: default; }
        .cancelled-note { background: #fef2f2; color: #b91c1c; font-size: 13px; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
        .fine-print { margin: 14px 0 0; color: #999; font-size: 12px; }
      `}</style>
    </div>
  );
}

export default UpgradeProPage;