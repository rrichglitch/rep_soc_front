import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import TopBar from '../components/TopBar';
import { getDirectMessages, sendDirectMessage, getProfileByIdentity, getProfileByEmail } from '../utils/spacetime';

function DMChatPage() {
  const { identity: otherId } = useParams<{ identity: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id_token || !otherId) return;
    const init = async () => {
      const payload = JSON.parse(atob(auth.user!.id_token!.split('.')[1]));
      const email = payload.email;
      if (email) {
        const p = await getProfileByEmail(email);
        if (p) setCurrentIdentity(p.identity.toHexString());
      }
      setOtherProfile(await getProfileByIdentity(otherId));
    };
    init();
  }, [auth.isAuthenticated, otherId]);

  useEffect(() => {
    if (!currentIdentity || !otherId) return;
    const interval = setInterval(() => {
      setMessages(getDirectMessages(currentIdentity, otherId));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIdentity, otherId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !otherId) return;
    await sendDirectMessage(otherId, input.trim());
    setInput('');
  };

  return (
    <div className="chat-page">
      <TopBar
        left={<button onClick={() => navigate('/messages')} className="topbar-back">← Back</button>}
        center={<span style={{fontWeight:600}}>{otherProfile?.fullName || 'Chat'}</span>}
        right={<div style={{width:36}} />}
      />
      <main className="chat-main">
        <div className="msg-list">
          {messages.map(m => (
            <div key={m.id.toString()} className={`msg ${m.senderIdentity === currentIdentity ? 'mine' : 'theirs'}`}>
              <p className="msg-text">{m.content}</p>
              <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="msg-form">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="msg-input" />
          <button type="submit" className="msg-send">Send</button>
        </form>
      </main>

      <style>{`
        .chat-page { min-height: 100vh; background: #f5f5f5; display: flex; flex-direction: column; }
        .chat-main { flex: 1; display: flex; flex-direction: column; max-width: 600px; width: 100%; margin: 0 auto; padding: 16px; }
        .msg-list { flex: 1; overflow-y: auto; padding-bottom: 8px; }
        .msg { margin-bottom: 8px; max-width: 75%; }
        .msg.mine { margin-left: auto; text-align: right; }
        .msg.theirs { margin-right: auto; }
        .msg-text { background: white; padding: 10px 14px; border-radius: 16px; display: inline-block; color: #333; font-size: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .msg.mine .msg-text { background: #667eea; color: white; }
        .msg-time { display: block; font-size: 11px; color: #999; margin-top: 2px; }
        .msg-form { display: flex; gap: 8px; padding: 12px 0; }
        .msg-input { flex: 1; padding: 12px; border: 1px solid #e0e0e0; border-radius: 24px; outline: none; font-size: 15px; }
        .msg-input:focus { border-color: #667eea; }
        .msg-send { padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 24px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default DMChatPage;
