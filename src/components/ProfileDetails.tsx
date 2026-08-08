import { useRef, useState, type ReactNode } from 'react';

interface ProfileDetailsProps {
  picture: string;
  name: string;
  city: string;
  description: string;
  onUpdateLocation: () => void;
  isLocationUpdating?: boolean;
  onSaveDescription: (value: string) => Promise<void>;
  onPictureClick?: () => void;
  pictureExtra?: ReactNode; // e.g. the Share button under the picture
  showLocationUpdate?: boolean; // default true
  children?: ReactNode;     // extra lines under the description (join date, back button, badges)
}

// Shared profile header for individual and org accounts: picture | name,
// location field + Update button, editable description, plus extra lines.
function ProfileDetails({
  picture, name, city, description,
  onUpdateLocation, isLocationUpdating, onSaveDescription,
  onPictureClick, pictureExtra, showLocationUpdate = true, children,
}: ProfileDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setEditValue(description || '');
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const saveEdit = async () => {
    setIsSaving(true);
    try {
      await onSaveDescription(editValue.trim());
      setIsEditing(false);
      setEditValue('');
    } catch (e: any) {
      alert(e?.message || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return (
    <div className="profile-header">
      <div className="profile-pic-wrapper">
        <div className="profile-picture-container">
          {picture ? (
            <img
              src={picture}
              alt={name}
              className={`profile-picture${onPictureClick ? ' clickable' : ''}`}
              onClick={onPictureClick}
            />
          ) : (
            <div className="profile-picture-placeholder" />
          )}
        </div>
        {pictureExtra}
      </div>
      <div className="profile-info">
        <h2 className="profile-name">{name}</h2>
        <div className="profile-field">
          <div className="field-display">
            <span className="field-label">Location:</span>
            <span className="field-value">{city || '—'}</span>
            {showLocationUpdate && (
              <button className="loc-update-btn" onClick={onUpdateLocation} disabled={isLocationUpdating}>
                {isLocationUpdating ? 'Updating…' : 'Update'}
              </button>
            )}
          </div>
        </div>
        <div className="profile-field description-field">
          {isEditing ? (
            <div className="edit-inline">
              <textarea
                ref={editInputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="edit-textarea"
                placeholder="Description"
                rows={3}
              />
              <div className="edit-actions">
                <button onClick={saveEdit} className="save-btn" disabled={isSaving}>
                  ✓
                </button>
                <button onClick={cancelEdit} className="cancel-btn">
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="field-display">
              <span className="field-value">{description || 'Add description'}</span>
              <button className="edit-btn" onClick={startEdit} disabled={isSaving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
      <style>{`
        .profile-header { display: flex; gap: 20px; align-items: flex-start; }
        .profile-pic-wrapper { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .profile-picture-container { flex-shrink: 0; }
        .profile-picture { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; }
        .profile-picture.clickable { cursor: pointer; }
        .profile-picture-placeholder { width: 100px; height: 100px; border-radius: 50%; background: #e0e0e0; }
        .profile-info { flex: 1; min-width: 0; }
        .profile-name { margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #333; }
        .profile-field { margin: 4px 0; }
        .field-display { display: flex; align-items: center; gap: 8px; }
        .field-label { color: #666; font-size: 14px; font-weight: 500; }
        .field-value { color: #666; font-size: 14px; }
        .loc-update-btn { margin-left: 8px; padding: 3px 5px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .loc-update-btn:disabled { opacity: 0.6; cursor: default; }
        .description-field .field-value { font-size: 13px; color: #888; line-height: 1.4; }
        .edit-btn { background: none; border: none; cursor: pointer; color: #999; opacity: 0; transition: opacity 0.2s; padding: 4px; }
        .profile-field:hover .edit-btn { opacity: 1; }
        .edit-btn:hover { color: #667eea; }
        .edit-inline { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .edit-textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; }
        .edit-actions { display: flex; gap: 8px; }
        .save-btn { padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .save-btn:disabled { opacity: 0.6; }
        .cancel-btn { padding: 6px 12px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        @media (max-width: 767px) {
          .profile-picture, .profile-picture-placeholder { width: 80px; height: 80px; }
          .profile-name { font-size: 19px; }
        }
      `}</style>
    </div>
  );
}

export default ProfileDetails;
