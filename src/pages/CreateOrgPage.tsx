import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { useApp } from '../App';
import { getProfileByEmail, createOrganization, getMyOrganizations, getMyOrgClaimFee, disconnectFromSpacetimeDB } from '../utils/spacetime';
import { clearOAuthSession } from '../utils/oauthSession';
import { requestCheckout } from '../utils/payments';
import { markCheckoutReturn, skipCheckoutDetour } from '../utils/checkoutReturn';
import { geocodeCity } from '../utils/geo';

const PENDING_KEY = 'veri_pending_org';

function CreateOrgPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = useApp();

  const handleLogout = () => {
    clearOAuthSession();
    disconnectFromSpacetimeDB();
    navigate('/', { replace: true });
  };
  const [form, setForm] = useState<any>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (saved && saved.name !== undefined) return saved;
    } catch {}
    return { name: '', picture: '', city: '', description: '' };
  });
  const [identity, setIdentity] = useState('');
  const [feePaid, setFeePaid] = useState<boolean>(() => getMyOrgClaimFee().length > 0);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgClaimSuccess = new URLSearchParams(location.search).get('org_claim') === 'success';

  // Resolve identity + keep the claim-fee cache fresh
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const who = email || '';
      if (who) {
        try {
          const p = await getProfileByEmail(who);
          if (alive && p) setIdentity(p.identity.toHexString());
        } catch {}
      }
      if (alive) setFeePaid(getMyOrgClaimFee().length > 0);
    };
    load();
    const t = setInterval(() => { if (alive) setFeePaid(getMyOrgClaimFee().length > 0); }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [email]);

  const doCreate = async (data: any) => {
    setCreating(true);
    try {
      const geo = await geocodeCity(data.city);
      await createOrganization(data.name, data.picture || '/veri.png', data.city, data.description, geo?.lat, geo?.lng);
      const mine = getMyOrganizations(identity);
      const created = mine.find((o: any) => o.name === data.name);
      if (created) navigate(`/org/${created.id.toString()}`);
      else navigate('/me', { replace: true });
    } catch (e: any) {
      alert(e?.message || 'Failed to create organization');
      setCreating(false);
    }
  };

  // Returning from Stripe: poll for the fee row, then create the org from the
  // pending form automatically. No pop-ups — the page state carries the flow.
  useEffect(() => {
    if (!orgClaimSuccess) return;
    markCheckoutReturn();
    setConfirming(true);
    let alive = true;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      const paid = getMyOrgClaimFee().length > 0;
      setFeePaid(paid);
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (paid && pending && pending.name) {
        if (!alive) return;
        setConfirming(false);
        localStorage.removeItem(PENDING_KEY);
        await doCreate(pending);
        return;
      }
      // Paid but no pending form — the org was already created in an earlier
      // pass (user backed into this page). Keep the landing URL intact so the
      // back button can still skip the Stripe entry.
      if (paid && !pending) {
        if (alive) setConfirming(false);
        return;
      }
      if (tries >= 20) {
        if (alive) setConfirming(false);
        return;
      }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 2000);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgClaimSuccess]);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > max) { h *= max / w; w = max; } }
      else { if (h > max) { w *= max / h; h = max; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      setForm({ ...form, picture: canvas.toDataURL('image/jpeg', 0.7) });
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.city || !form.description) {
      alert('Please fill in organization name, city and description.');
      return;
    }
    if (!identity) {
      alert('Could not resolve your account — please refresh and try again.');
      return;
    }
    const paid = feePaid || getMyOrgClaimFee().length > 0;
    if (paid) {
      await doCreate(form);
      return;
    }
    // Fee unpaid: save the form, pay, then create automatically on return.
    setPaying(true);
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ ...form, name: form.name.trim(), city: form.city.trim(), description: form.description.trim() }));
      const { url } = await requestCheckout('org', identity, email || undefined);
      window.location.assign(url);
    } catch (err: any) {
      alert(err?.message || 'Failed to start checkout. Please try again.');
      setPaying(false);
    }
  };

  const saveField = (key: string, value: string) => setForm({ ...form, [key]: value });
  const busy = paying || creating || confirming;

  const handleBack = () => {
    if (!skipCheckoutDetour()) navigate(-1);
  };

  return (
    <div className="create-org-page">
      <TopBar
        left={<button onClick={handleBack} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        right={<AuthActions profileReplacement={<button onClick={handleLogout} className="topbar-signin" style={{background:"#dc2626"}}>Log Out</button>} />}
        absoluteCenter
      />
      <div className="create-org-body">
        <h1 className="page-title">Create Organization</h1>
        <form onSubmit={handleSubmit} className="create-org-card">
          <input value={form.name} onChange={e => saveField('name', e.target.value)} placeholder="Organization name" required disabled={busy} className="org-input" />
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handlePictureChange} style={{ display: 'none' }} disabled={busy} />
          <div onClick={() => !busy && fileInputRef.current?.click()} className={`org-pic-upload${busy ? ' disabled' : ''}`}>
            {form.picture ? (
              <img src={form.picture} alt="Preview" className="org-pic-preview" />
            ) : (
              <span>Tap to upload picture</span>
            )}
          </div>
          <input value={form.city} onChange={e => saveField('city', e.target.value)} placeholder="City" required disabled={busy} className="org-input" />
          <textarea value={form.description} onChange={e => saveField('description', e.target.value)} placeholder="Description" required disabled={busy} className="org-input" rows={3} />
          <button type="submit" className="org-submit" disabled={busy}>
            {busy && <span className="btn-spinner" />}
            {creating ? 'Creating…' : paying ? 'Opening payment…' : confirming ? 'Confirming payment…' : feePaid ? 'Create Organization' : 'Pay $19.99 & Create Organization'}
          </button>
          {confirming ? (
            <p className="confirm-note"><span className="btn-spinner small" /> Confirming your payment — your organization will be created automatically.</p>
          ) : (
            !feePaid && <p className="fee-note">One-time $19.99 claim fee · strictly separate from Pro — you'll be taken to secure Stripe checkout.</p>
          )}
        </form>
      </div>
      <style>{`
        .create-org-page { min-height: 100vh; background: #f5f5f5; }
        .topbar-back { background: none; border: none; font-size: 15px; color: #667eea; cursor: pointer; }
        .topbar-logo img { height: 28px; }
        .create-org-body { display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }
        .page-title { margin: 0 0 18px; font-size: 20px; font-weight: 700; color: #222; text-align: center; }
        .create-org-card { display: flex; flex-direction: column; gap: 10px; background: white; border-radius: 12px; padding: 24px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 380px; width: 100%; }
        .org-input { padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; outline: none; font-family: inherit; resize: vertical; }
        .org-input:focus { border-color: #667eea; }
        .org-pic-upload { padding: 16px; border: 2px dashed #e0e0e0; border-radius: 8px; text-align: center; cursor: pointer; color: #999; font-size: 14px; display: flex; align-items: center; justify-content: center; min-height: 60px; }
        .org-pic-upload:hover { border-color: #667eea; }
        .org-pic-upload.disabled { opacity: 0.6; pointer-events: none; }
        .org-pic-preview { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
        .org-submit { padding: 12px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .org-submit:hover { background: #16a34a; }
        .org-submit:disabled { opacity: 0.7; cursor: default; }
        .btn-spinner { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: btnspin 0.8s linear infinite; display: inline-block; }
        .btn-spinner.small { width: 12px; height: 12px; border-width: 2px; vertical-align: -2px; margin-right: 6px; }
        @keyframes btnspin { to { transform: rotate(360deg); } }
        .confirm-note { margin: 10px 0 0; color: #667eea; font-size: 13px; font-weight: 600; text-align: center; }
        .fee-note { margin: 2px 0 0; color: #999; font-size: 12px; text-align: center; }
      `}</style>
    </div>
  );
}

export default CreateOrgPage;