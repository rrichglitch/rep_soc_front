import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { Link } from 'react-router-dom';
import { useApp } from '../App';

function UpgradeProPage() {
  const navigate = useNavigate();
  const { email } = useApp();

  return (
    <div className="upgrade-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="back-btn">← Back</button>}
        center={<span className="upgrade-title">Upgrade to Pro</span>}
        right={<Link to={email ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
      />
      <div className="upgrade-body">
        <div className="upgrade-card">
          <div className="pro-icon">★</div>
          <h2>Veri Pro</h2>
          <p className="tagline">Unlimited descriptive searches. A strictly separate payment from organization claiming.</p>
          <ul className="benefits">
            <li>Unlimited descriptive searches</li>
            <li>Support the future of Veri Social</li>
          </ul>
          <button className="buy-btn" onClick={() => alert('Payments coming soon — Pro is free during testing.')}>
            Upgrade — coming soon
          </button>
          <p className="fine-print">Testing phase: all features are currently free to try.</p>
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
        .tagline { color: #666; font-size: 14px; margin: 0 0 20px; }
        .benefits { list-style: none; padding: 0; margin: 0 0 24px; text-align: left; }
        .benefits li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; color: #444; }
        .benefits li:before { content: '✓'; color: #22c55e; font-weight: 700; margin-right: 10px; }
        .buy-btn { width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
        .fine-print { margin: 14px 0 0; color: #999; font-size: 12px; }
      `}</style>
    </div>
  );
}

export default UpgradeProPage;
