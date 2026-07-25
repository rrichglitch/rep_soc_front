import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { getOrgMessages, sendOrgMessage, getOrganizationById, getProfileByEmail } from '../utils/spacetime';

function OrgChatPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('Chat');
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const orgId = id ? BigInt(id) : 0n;

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id_token || !id) return;
    const init = async () => {
      const payload = JSON.parse(atob(auth.user!.id_token!.split('.')[1]));
      const email = payload.email;
      if (email) {
        const p = await getProfileByEmail(email);
        if (p) setCurrentIdentity(p.identity.toHexString());
      }
      const org = getOrganizationById(orgId);
      if (org) setOrgName(org.name);
    };
    init();
  }, [auth.isAuthenticated, id]);

  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(() => {
      setMessages(getOrgMessages(orgId));
    }, 1000);
    return () => clearInterval(interval);
  }, [orgId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !orgId) return;
    await sendOrgMessage(orgId, input.trim());
    setInput('');
  };

  return (
    <div className="chat-page">
      <TopBar
        left={<button onClick={() => navigate('/friends')} className="topbar-back">← Back</button>}
        center={<span style={{fontWeight:600}}>{orgName}</span>}
        right={<AuthActions hideChat />}
       
      />
      <main className="chat-main">
        <div className="msg-list">
          {messages.map(m => (
            <div key={m.id.toString()} className={`msg ${m.senderIdentity === currentIdentity ? 'mine' : 'theirs'}`}>
              {m.senderIdentity !== currentIdentity && <span className="msg-sender">{m.senderName}</span>}
              <p className="msg-text">{m.content}</p>
              <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="msg-form">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="msg-input" autoFocus />
          <button type="submit" className="msg-send"><svg width="28" height="28" viewBox="0 0 20 20" fill="white"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.288z"/></svg></button>
        </form>
      </main>

      <style>{`
        .chat-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
        .chat-main { flex: 1; display: flex; flex-direction: column; max-width: 600px; width: 100%; margin: 0 auto; padding: 16px 16px 0; }
        .msg-list { flex: 1; overflow-y: auto; padding-bottom: 80px; }
        .msg { margin-bottom: 8px; max-width: 75%; }
        .msg.mine { margin-left: auto; text-align: right; }
        .msg.theirs { margin-right: auto; }
        .msg-sender { font-size: 11px; color: #667eea; font-weight: 600; display: block; margin-bottom: 2px; }
        .msg-text { background: white; padding: 10px 14px; border-radius: 16px; display: inline-block; color: #333; font-size: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .msg.mine .msg-text { background: #667eea; color: white; }
        .msg-time { display: block; font-size: 11px; color: #999; margin-top: 2px; }
        .msg-form { display: flex; gap: 8px; padding: 12px 16px; background: #f5f5f5; position: fixed; bottom: 0; left: 0; right: 0; max-width: 600px; margin: 0 auto; z-index: 10; }
        .msg-input { flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0; border-radius: 24px; outline: none; font-size: 15px; background: white; }
        .msg-input:focus { border-color: #667eea; }
        .msg-send { padding: 6px 12px; display: flex; align-items: center; justify-content: center; background: #667eea; color: white; border: none; border-radius: 24px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default OrgChatPage;
