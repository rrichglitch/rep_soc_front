import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useOrg, type ActiveOrg } from '../contexts/OrgContext';
import { getProfileByEmail, getMyStoryPosts, getMyPosts, getOrganizationMembers, getOrganizationById, promoteToCoLeader, demoteCoLeader, transferLeadership, connectToSpacetimeDB, updateOrganization } from '../utils/spacetime';
import { geocodeCity } from '../utils/geo';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';

function OrgAccountView() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { activeOrg, logoutOrg } = useOrg();
  const org = activeOrg as ActiveOrg;

  const [members, setMembers] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'story' | 'posts'>('story');
  const [createdAt, setCreatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!org) return;
    if (!auth.isAuthenticated || !auth.user) return;
    let userEmail: string | undefined;
    if (auth.user.id_token) {
      try {
        const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
        userEmail = payload.email;
      } catch {}
    }
    if (!userEmail) return;
    const load = async () => {
      await connectToSpacetimeDB(userEmail!, auth.user!.access_token).catch(() => {});
      const update = async () => {
        const ms = getOrganizationMembers(org.id);
        setMembers(ms);
        setStories(await getMyStoryPosts(org.identity));
        setMyPosts(await getMyPosts(org.identity));
        const orgRow = getOrganizationById(org.id);
        if (orgRow) setCreatedAt(new Date(Number((orgRow as any).createdAt?.microsSinceUnixEpoch || 0) / 1000));
      };
      update();
      // Resolve my role from my user identity
      const profile = await getProfileByEmail(userEmail!);
      if (profile) {
        const myHex = profile.identity.toHexString();
        const mine = getOrganizationMembers(org.id).find((m: any) => m.identity === myHex);
        setMyRole(mine ? mine.role : null);
      }
      const interval = setInterval(update, 3000);
      return () => clearInterval(interval);
    };
    load();
  }, [org?.id, auth.isAuthenticated, auth.user]);

  if (!org) return null;

  const handlePromote = async (memberIdentity: string) => {
    try { await promoteToCoLeader(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };
  const handleDemote = async (memberIdentity: string) => {
    try { await demoteCoLeader(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };
  const handleTransfer = async (memberIdentity: string, memberName: string) => {
    const ok = window.confirm(`Transfer leadership to ${memberName}? You will be instantly demoted to co-leader.`);
    if (!ok) return;
    try { await transferLeadership(org.id, memberIdentity); } catch (e: any) { alert(e.message || 'Failed'); }
  };

  const handleRoleChange = async (m: any, newRole: string) => {
    if (newRole === m.role) return;
    if (newRole === 'leader') {
      await handleTransfer(m.identity, m.fullName);
      return;
    }
    if (newRole === 'co_leader') {
      await handlePromote(m.identity);
      return;
    }
    if (newRole === 'member' && m.role === 'co_leader') {
      await handleDemote(m.identity);
    }
  };

  const canManage = myRole === 'leader' || myRole === 'co_leader';

  const handleRefreshLocation = async () => {
    if (!org.city) { alert('This organization has no city set.'); return; }
    try {
      const geo = await geocodeCity(org.city);
      if (!geo) { alert('Could not find a location for this city.'); return; }
      await updateOrganization(org.id, undefined, undefined, undefined, geo.lat, geo.lng);
      alert('Location updated from city.');
    } catch (e: any) {
      alert(e.message || 'Failed to update location');
    }
  };

  return (
    <div className="my-profile-page">
      <TopBar
        left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>}
        center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        absoluteCenter
        right={<AuthActions />}
      />
      <main className="main-content">
        <div className="profile-section">
          <div className="profile-header">
            <div className="profile-pic-wrapper">
              <div className="profile-picture-container">
                {org.picture ? (
                  <img src={org.picture} alt={org.name} className="profile-picture" />
                ) : (
                  <div className="profile-picture-placeholder" />
                )}
              </div>
            </div>
            <div className="profile-info">
              <h2 className="profile-name">{org.name}</h2>
              {org.city && <p className="profile-city">{org.city}</p>}
              {org.description && <p className="profile-description">{org.description}</p>}
              <p className="join-date">
                {createdAt ? `Founded ${createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}
              </p>
              <button onClick={() => { logoutOrg(); navigate('/home'); }} className="back-to-account-btn">
                ← Back to my account
              </button>
              {canManage && org.city && (
                <button onClick={handleRefreshLocation} className="refresh-loc-btn">Set location from city</button>
              )}
            </div>
          </div>
        </div>

        {canManage && (
          <div className="members-section">
            <h3>Members ({members.length})</h3>
            <div className="members-list">
              {members.map((m: any) => (
                <div key={m.identity} className="member-row">
                  <Link to={`/profile/${m.identity}`} className="member-link">
                    {m.picture ? <img src={m.picture} alt={m.fullName} className="member-avatar" /> : <div className="member-avatar-placeholder" />}
                    <span className="member-name">{m.fullName}</span>
                  </Link>
                  {m.role === 'leader' ? (
                    <span className={`role-badge role-leader`}>Leader</span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m, e.target.value)}
                      disabled={!canManage}
                      className="role-select"
                    >
                      <option value="member">Member</option>
                      <option value="co_leader">Co-Leader</option>
                      {myRole === 'leader' && <option value="leader">Leader</option>}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="story-section">
          <div className="profile-tabs">
            <button className={`profile-tab ${activeTab === 'story' ? 'active' : ''}`} onClick={() => setActiveTab('story')}>Story</button>
            <button className={`profile-tab ${activeTab === 'posts' ? 'active' : ''}`} onClick={() => setActiveTab('posts')}>Posts</button>
          </div>

          {activeTab === 'story' ? (
            <>
              <div className="no-post-own-story">
                <p>You cannot post on your own story. Others can share stories about you.</p>
              </div>
              {stories.length === 0 ? (
                <div className="empty-story"><p>No stories about you yet.</p></div>
              ) : (
                <div className="stories-list">
                  {stories.map((story: any) => (
                    <div key={story.id.toString()} className="story-card">
                      <Link to={`/profile/${story.posterIdentity}`} className="story-header-link">
                        <div className="story-header">
                          {story.posterPicture ? (
                            <img src={story.posterPicture} alt={story.posterName} className="story-avatar" />
                          ) : (
                            <div className="story-avatar-placeholder" />
                          )}
                          <div className="story-meta">
                            <span className="story-author">{story.posterName}</span>
                            <span className="story-date">{new Date(story.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </Link>
                      <p className="story-content">{story.content}</p>
                      {story.mediaData && story.mediaData.length > 0 && (
                        <img src={story.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {myPosts.length === 0 ? (
                <div className="empty-story"><p>This organization hasn't posted on anyone's story yet.</p></div>
              ) : (
                <div className="stories-list">
                  {myPosts.map((post: any) => (
                    <div key={post.id.toString()} className="story-card">
                      <Link to={`/profile/${post.profileOwnerIdentity}`} className="post-receiver-link">
                        <div className="post-receiver-header">
                          <div className="post-receiver-meta">
                            <span className="post-receiver-name">{post.profileOwnerName}</span>
                            <span className="post-receiver-date">{new Date(post.createdAt).toLocaleDateString()}</span>
                          </div>
                          {post.profileOwnerPicture ? (
                            <img src={post.profileOwnerPicture} alt={post.profileOwnerName} className="story-avatar" />
                          ) : (
                            <div className="story-avatar-placeholder" />
                          )}
                        </div>
                      </Link>
                      <p className="story-content">{post.content}</p>
                      {post.mediaData && post.mediaData.length > 0 && (
                        <img src={post.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <style>{`
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .profile-section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .profile-header { display: flex; gap: 20px; }
        .profile-pic-wrapper { display: flex; flex-direction: column; align-items: center; }
        .profile-picture-container { position: relative; flex-shrink: 0; }
        .profile-picture { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; }
        .profile-picture-placeholder { width: 100px; height: 100px; border-radius: 50%; background: #e0e0e0; }
        .profile-info { flex: 1; }
        .profile-name { margin: 0 0 12px; font-size: 22px; color: #333; }
        .profile-city { margin: 0 0 8px; color: #666; font-size: 14px; }
        .profile-description { margin: 0; color: #444; font-size: 14px; line-height: 1.5; max-width: 400px; white-space: pre-wrap; }
        .join-date { margin: 12px 0 0; font-size: 13px; color: #999; }
        .back-to-account-btn { margin-top: 12px; padding: 8px 16px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .back-to-account-btn:hover { background: #e5e7eb; }
        .refresh-loc-btn { margin-top: 8px; padding: 8px 16px; background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .members-section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .members-section h3 { margin: 0 0 12px; color: #333; font-size: 15px; }
        .member-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .member-row:last-child { border-bottom: none; }
        .member-link { display: flex; align-items: center; gap: 10px; text-decoration: none; color: #333; flex: 1; min-width: 0; }
        .member-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
        .member-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: #e0e0e0; flex-shrink: 0; }
        .member-name { font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .role-badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
        .role-leader { background: #fef3c7; color: #92400e; }
        .role-co_leader { background: #dbeafe; color: #1e40af; }
        .role-member { background: #f3f4f6; color: #374151; }
        .role-select { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-weight: 600; background: white; color: #374151; cursor: pointer; flex-shrink: 0; }
        .role-select:disabled { background: #f3f4f6; color: #9ca3af; cursor: default; }
        .story-section h2 { font-size: 16px; color: #666; margin: 0 0 16px; }
        .profile-tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }
        .profile-tab { padding: 10px 20px; background: none; border: none; border-bottom: 2px solid transparent; font-size: 15px; font-weight: 600; color: #666; cursor: pointer; }
        .profile-tab:hover { color: #667eea; }
        .profile-tab.active { color: #667eea; border-bottom-color: #667eea; }
        .no-post-own-story { background: white; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .no-post-own-story p { margin: 0; color: #666; font-size: 14px; }
        .stories-list { display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
        .story-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .story-header-link { text-decoration: none; display: block; margin-bottom: 12px; }
        .story-header-link:hover .story-author { color: #667eea; }
        .story-header { display: flex; align-items: center; gap: 12px; }
        .story-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
        .story-avatar-placeholder { width: 40px; height: 40px; border-radius: 50%; background: #e0e0e0; }
        .story-meta { display: flex; flex-direction: column; }
        .story-author { font-weight: 600; color: #333; }
        .story-date { font-size: 12px; color: #999; }
        .story-content { margin: 0; color: #333; line-height: 1.5; white-space: pre-wrap; }
        .story-media { margin-top: 12px; max-width: 100%; border-radius: 8px; }
        .empty-story { background: white; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .empty-story p { margin: 0; color: #666; }
        .post-receiver-link { text-decoration: none; }
        .post-receiver-header { display: flex; align-items: center; gap: 12px; }
        .post-receiver-meta { display: flex; flex-direction: column; align-items: flex-end; }
        .post-receiver-name { font-weight: 600; color: #333; font-size: 14px; }
        .post-receiver-date { font-size: 12px; color: #999; }
        .post-receiver-link:hover .post-receiver-name { color: #667eea; }
      `}</style>
    </div>
  );
}

export default OrgAccountView;
