import { useState } from 'react';
import { updateLocation } from '../utils/spacetime';
import { getBrowserLocation, jitterLocation } from '../utils/geo';

export type LocationPrecision = 'off' | 'approx' | 'exact';

interface LocationSettingsProps {
  currentPrecision: LocationPrecision;
  onChanged: (precision: LocationPrecision) => void;
}

function LocationSettings({ currentPrecision, onChanged }: LocationSettingsProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [showFullWarning, setShowFullWarning] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<LocationPrecision | null>(null);

  const applyPrecision = async (precision: LocationPrecision) => {
    setIsBusy(true);
    try {
      if (precision === 'off') {
        await updateLocation(0, 0, 'off');
        onChanged('off');
        return;
      }
      // approx or exact — need the device location
      const pos = await getBrowserLocation();
      // Approximate precision is jittered ON DEVICE so the exact position never leaves
      const toSend = precision === 'approx' ? jitterLocation(pos.lat, pos.lng, 15) : pos;
      await updateLocation(toSend.lat, toSend.lng, precision);
      onChanged(precision);
    } catch (e: any) {
      alert(e?.message === 'Geolocation not supported on this device'
        ? 'This device does not support location services.'
        : 'Could not get your location. Check that location permissions are enabled for this site.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelect = (precision: LocationPrecision) => {
    if (precision === currentPrecision) return;
    if (precision === 'exact') {
      setPendingChoice('exact');
      setShowFullWarning(true);
      return;
    }
    applyPrecision(precision);
  };

  const handleConfirmFull = () => {
    setShowFullWarning(false);
    const p = pendingChoice;
    setPendingChoice(null);
    if (p) applyPrecision(p);
  };

  const handleCancelFull = () => {
    setShowFullWarning(false);
    setPendingChoice(null);
  };

  const options: { value: LocationPrecision; label: string; desc: string }[] = [
    { value: 'off', label: 'Off', desc: 'Your location is not stored or shown to anyone.' },
    { value: 'approx', label: 'Approximate', desc: 'Only an approximate location, accurate within 15 miles, is stored.' },
    { value: 'exact', label: 'Full precision', desc: 'Your exact location is stored and visible to others.' },
  ];

  return (
    <div className="location-settings">
      <h3>Location</h3>
      <p className="location-intro">
        Location is only fetched once — when you create your account or set your city — using a
        temporary one-time permission. It helps people and organizations near you find each other.
        You can change or turn it off at any time.
      </p>
      <div className="location-options">
        {options.map((opt) => (
          <label key={opt.value} className={`location-option ${currentPrecision === opt.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="location-precision"
              checked={currentPrecision === opt.value}
              onChange={() => handleSelect(opt.value)}
              disabled={isBusy}
            />
            <div className="location-option-text">
              <span className="location-option-label">{opt.label}</span>
              <span className="location-option-desc">{opt.desc}</span>
            </div>
          </label>
        ))}
      </div>
      {isBusy && <p className="location-busy">Updating location…</p>}

      {showFullWarning && (
        <div className="loc-modal-overlay" onClick={handleCancelFull}>
          <div className="loc-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Show your exact location?</h3>
            <p>
              Choosing <strong>Full precision</strong> will store and display your <strong>exact
              location</strong> to other people and organizations. Anyone who can see your profile
              will be able to see where you are.
            </p>
            <p>
              This can reveal where you live, work, or spend time. Only choose this if you are
              comfortable with others knowing your precise whereabouts.
            </p>
            <div className="loc-modal-actions">
              <button onClick={handleCancelFull} className="loc-cancel-btn">Cancel</button>
              <button onClick={handleConfirmFull} className="loc-confirm-btn">I understand — show my exact location</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .location-settings { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .location-settings h3 { margin: 0 0 8px; color: #333; font-size: 15px; }
        .location-intro { margin: 0 0 14px; color: #666; font-size: 13px; line-height: 1.5; }
        .location-options { display: flex; flex-direction: column; gap: 8px; }
        .location-option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; transition: border-color 0.2s; }
        .location-option.selected { border-color: #667eea; background: #f5f7ff; }
        .location-option input { margin-top: 3px; accent-color: #667eea; }
        .location-option-text { display: flex; flex-direction: column; }
        .location-option-label { font-weight: 600; font-size: 14px; color: #333; }
        .location-option-desc { font-size: 12px; color: #888; margin-top: 2px; }
        .location-busy { margin-top: 10px; font-size: 12px; color: #667eea; }
        .loc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
        .loc-modal { background: white; border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .loc-modal h3 { margin: 0 0 12px; color: #b91c1c; font-size: 17px; }
        .loc-modal p { margin: 0 0 10px; color: #444; font-size: 14px; line-height: 1.5; }
        .loc-modal-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
        .loc-cancel-btn { padding: 8px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-confirm-btn { padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
      `}</style>
    </div>
  );
}

export default LocationSettings;
