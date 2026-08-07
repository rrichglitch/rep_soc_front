import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '../contexts/OrgContext';
import { getMyOrganizations, createOrganization, isPro, upgradeToPro } from '../utils/spacetime';
import { geocodeCity } from '../utils/geo';

function OrgSection({ profileIdentity }: { profileIdentity: string }) {
  const navigate = useNavigate();
  const { loginAsOrg, activeOrg } = useOrg();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [proStatus, setProStatus] = useState(false);
  const [form, setForm] = useState({ name: '', picture: '', city: '', description: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profileIdentity) return;
    setOrgs(getMyOrganizations(profileIdentity));
    setProStatus(isPro(profileIdentity));
    const interval = setInterval(() => {
      setOrgs(getMyOrganizations(profileIdentity));
    }, 3000);
    return () => clearInterval(interval);
  }, [profileIdentity]);

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
      setForm({...form, picture: canvas.toDataURL('image/jpeg', 0.7)});
    };
    img.src = URL.createObjectURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      // Geocode the city so the org appears on location-based search (best effort)
      const geo = await geocodeCity(form.city);
      await createOrganization(form.name, form.picture || '/veri.png', form.city, form.description, geo?.lat, geo?.lng);
      setShowCreate(false);
      setForm({ name: '', picture: '', city: '', description: '' });
      setOrgs(getMyOrganizations(profileIdentity));
    } catch (err: any) {
      alert(err.message || 'Failed to create');
    }
  };

  const handleUpgrade = async () => {
    try {
      await upgradeToPro();
      setProStatus(true);
    } catch (err: any) {
      alert(err.message || 'Failed');
    }
  };

  return (
    <div className="org-section">
      <h3>Your Organizations</h3>

      {orgs.length === 0 ? (
        <p className="no-orgs">No organizations yet.</p>
      ) : (
        <div className="orgs-list">
          {orgs.map(org => (
            <div key={org.id.toString()} className="org-row">
              <Link to={`/org/${org.id}`} className="org-link">
                {org.picture ? <img src={org.picture} alt={org.name} className="org-avatar" /> : <div className="org-avatar-placeholder" />}
                <div className="org-info">
                  <span className="org-name">{org.name}</span>
                  <span className="org-role">{org.role}</span>
                </div>
              </Link>
              <button onClick={() => { loginAsOrg(org); navigate('/me'); }} className="use-org-btn">
                {activeOrg?.id === org.id ? 'Active' : 'Use'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!proStatus ? (
        <div className="pro-prompt">
          <p>Pro subscription required to create organizations.</p>
          <button onClick={handleUpgrade} className="upgrade-btn">Upgrade to Pro</button>
        </div>
      ) : !showCreate ? (
        <button onClick={() => setShowCreate(true)} className="create-org-btn">+ Create Organization</button>
      ) : (
        <form onSubmit={handleCreate} className="create-org-form">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Organization name" required className="org-input" />
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handlePictureChange} style={{display:'none'}} />
          <div onClick={() => fileInputRef.current?.click()} className="org-pic-upload">
            {form.picture ? (
              <img src={form.picture} alt="Preview" className="org-pic-preview" />
            ) : (
              <span>Tap to upload picture</span>
            )}
          </div>
          <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="City" required className="org-input" />
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" required className="org-input" rows={2} />
          <div className="org-form-actions">
            <button type="submit" className="org-submit">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="org-cancel">Cancel</button>
          </div>
        </form>
      )}

      <style>{`
        .org-section { background: white; border-radius: 12px; padding: 24px; margin-top: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .org-section h3 { margin: 0 0 16px; color: #333; font-size: 16px; }
        .no-orgs { color: #999; font-size: 14px; }
        .orgs-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .org-row { display: flex; align-items: center; justify-content: space-between; padding: 8px; border: 1px solid #f0f0f0; border-radius: 8px; }
        .org-link { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #333; flex: 1; }
        .org-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
        .org-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: #e0e0e0; }
        .org-info { display: flex; flex-direction: column; }
        .org-name { font-weight: 600; font-size: 14px; }
        .org-role { font-size: 11px; color: #999; text-transform: capitalize; }
        .use-org-btn { padding: 6px 14px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .pro-prompt { background: #fff8e1; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 12px; }
        .pro-prompt p { margin: 0 0 8px; color: #92400e; font-size: 14px; }
        .upgrade-btn { padding: 8px 20px; background: #f59e0b; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .create-org-btn { padding: 10px 20px; background: #22c55e; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; }
        .create-org-form { display: flex; flex-direction: column; gap: 8px; }
        .org-input { padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; outline: none; }
        .org-input:focus { border-color: #667eea; }
        .org-pic-upload { padding: 16px; border: 2px dashed #e0e0e0; border-radius: 8px; text-align: center; cursor: pointer; color: #999; font-size: 14px; display: flex; align-items: center; justify-content: center; min-height: 60px; }
        .org-pic-upload:hover { border-color: #667eea; }
        .org-pic-preview { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; }
        .org-form-actions { display: flex; gap: 8px; }
        .org-submit { padding: 8px 20px; background: #667eea; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .org-cancel { padding: 8px 20px; background: #999; color: white; border: none; border-radius: 6px; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default OrgSection;
