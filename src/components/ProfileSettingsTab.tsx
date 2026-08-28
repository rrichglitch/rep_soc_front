import { useState } from 'react';

interface ProfileSettingsTabProps {
  // The shared precise-location control (per-page wiring — individual vs org).
  // Rendered as its own card at the top of the tab.
  locationControl: React.ReactNode | null;
  // Destructive account action at the bottom, after deliberate spacing.
  // Omit the whole danger section by leaving the label unset.
  dangerLabel?: string;
  // Small note above the danger button (e.g. what gets deleted).
  dangerHint?: string;
  onDanger?: () => Promise<void> | void;
  // Two-step inline confirmation for irreversible actions — no pop-ups in
  // normal flow, the page state carries the confirmation (armed state).
  confirmRequired?: boolean;
  // Label shown in the armed state (defaults to the danger label itself).
  confirmLabel?: string;
}

// Shared Settings tab for the individual /me page and the org account view:
// precise-location card on top, destructive account action at the bottom with
// deliberate space between. One implementation, both pages.
function ProfileSettingsTab({
  locationControl,
  dangerLabel,
  dangerHint,
  onDanger,
  confirmRequired,
  confirmLabel,
}: ProfileSettingsTabProps) {
  const [armed, setArmed] = useState(false);

  const run = async () => {
    if (!onDanger) return;
    if (confirmRequired && !armed) {
      setArmed(true);
      return;
    }
    try {
      await onDanger();
    } catch (e: any) {
      alert(e?.message || 'Failed');
    }
    setArmed(false);
  };

  return (
    <div className="settings-tab">
      {locationControl}
      {dangerLabel && (
        <>
          <div className="settings-danger-spacer" />
          <div className="settings-danger-card">
            {dangerHint && <p className="settings-danger-hint">{dangerHint}</p>}
            <button
              className={`danger-btn${armed ? ' armed' : ''}`}
              onClick={run}
            >
              {confirmRequired && armed ? (confirmLabel || dangerLabel) : dangerLabel}
            </button>
          </div>
        </>
      )}
      <style>{`
        .settings-danger-spacer { height: 24px; }
        .settings-danger-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .settings-danger-hint { margin: 0 0 12px; font-size: 13px; color: #888; line-height: 1.4; }
        .danger-btn { width: 100%; padding: 12px 16px; border: none; border-radius: 8px; background: #dc2626; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .danger-btn:hover { background: #b91c1c; }
        .danger-btn.armed { background: #fff; color: #dc2626; border: 1px solid #dc2626; padding: 11px 15px; }
        .danger-btn.armed:hover { background: #fef2f2; }
      `}</style>
    </div>
  );
}

export default ProfileSettingsTab;