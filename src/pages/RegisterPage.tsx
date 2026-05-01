import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from '../config';
import { useApp } from '../App';
import { fileToBase64, isFileSizeValid, isFileTypeValid, validateAndSanitizeCity, validateAndSanitizeDescription } from '../utils/sanitize';
import { isDisplayNameAcceptable } from '../utils/nameMatcher';
import { initiateDiditVerification, checkDiditVerification, createVerifiedProfile } from '../utils/spacetime';

const PENDING_REGISTRATION_KEY = 'pending_registration';

interface PendingRegistration {
  profilePicture: string;
  city: string;
  description: string;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { email, setHasProfile } = useApp();

  const diditSessionId = searchParams.get('verificationSessionId');
  const diditStatus = searchParams.get('status');

  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [storedPictureBase64, setStoredPictureBase64] = useState<string | null>(null);
  const [diditSelfieBase64, setDiditSelfieBase64] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diditVerified, setDiditVerified] = useState(false);
  const [checkingDidit, setCheckingDidit] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [showNameTooltip, setShowNameTooltip] = useState(false);

  // On mount: restore pending registration from localStorage if present
  useEffect(() => {
    const stored = localStorage.getItem(PENDING_REGISTRATION_KEY);
    if (stored) {
      try {
        const parsed: PendingRegistration = JSON.parse(stored);
        setCity(parsed.city);
        setDescription(parsed.description);
        if (parsed.profilePicture) {
          setPicturePreview(parsed.profilePicture);
          setStoredPictureBase64(parsed.profilePicture);
        }
      } catch (e) {
        console.error('Failed to restore pending registration:', e);
      }
    }
  }, []);

  // On mount: handle Didit callback
  useEffect(() => {
    if (!diditSessionId || diditVerified) return;

    const handleCallback = async () => {
      setCheckingDidit(true);
      setError(null);

      try {
        if (diditStatus && diditStatus.toUpperCase() !== 'APPROVED') {
          throw new Error(`Identity verification ${diditStatus}. Please try again.`);
        }

        const result = await checkDiditVerification(diditSessionId);
        setFullName(result.fullName);
        setDisplayName(result.fullName);

        // Fetch Didit selfie image and convert to base64 for storage
        if (result.selfieImage) {
          try {
            const selfieBase64 = await fetchImageAsBase64(result.selfieImage);
            setDiditSelfieBase64(selfieBase64);
          } catch (imgErr) {
            console.error('Failed to fetch Didit selfie image:', imgErr);
            // Don't block registration if selfie fetch fails
          }
        }

        setDiditVerified(true);
        setCheckingDidit(false);

        // Clean up URL query params
        window.history.replaceState({}, document.title, '/register');
      } catch (err) {
        console.error('Didit callback error:', err);
        setError(err instanceof Error ? err.message : 'Identity verification failed');
        setCheckingDidit(false);
      }
    };

    handleCallback();
  }, [diditSessionId, diditStatus, diditVerified]);

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isFileTypeValid(file, [...ALLOWED_MEDIA_TYPES])) {
        setError('Invalid file type. Please upload an image.');
        return;
      }
      if (!isFileSizeValid(file, MAX_MEDIA_SIZE_BYTES)) {
        setError('File is too large. Maximum size is 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      const base64 = await fileToBase64(file);
      setStoredPictureBase64(base64);
      setError(null);
    }
  };

  const savePendingRegistration = () => {
    const pending: PendingRegistration = {
      profilePicture: storedPictureBase64 || '',
      city,
      description,
    };
    localStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(pending));
  };

  const clearPendingRegistration = () => {
    localStorage.removeItem(PENDING_REGISTRATION_KEY);
  };

  const handleInitiateDidit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!storedPictureBase64) {
        throw new Error('Profile picture is required');
      }
      if (!email) {
        throw new Error('Email not available. Please log in again.');
      }

      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      // Save form data so it's available after redirect
      savePendingRegistration();

      const url = await initiateDiditVerification(
        email,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription
      );

      // Redirect to Didit hosted verification
      window.location.href = url;
    } catch (err) {
      console.error('Initiate Didit error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDisplayNameError(null);
    setIsLoading(true);

    try {
      if (!diditSessionId) {
        throw new Error('No verification session found. Please start identity verification.');
      }
      if (!storedPictureBase64) {
        throw new Error('Profile picture is required');
      }

      // Client-side display name validation
      const nameCheck = isDisplayNameAcceptable(displayName, fullName);
      if (!nameCheck.acceptable) {
        setDisplayNameError(nameCheck.reason ?? 'Invalid display name');
        setShowNameTooltip(true);
        setIsLoading(false);
        return;
      }

      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      await createVerifiedProfile(
        diditSessionId,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription,
        diditSelfieBase64,
        displayName
      );

      clearPendingRegistration();

      // Wait for subscription to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      setHasProfile(true);
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('Create profile error:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred';
      setError(msg);
      // If backend rejected the name, highlight the field too
      if (msg.toLowerCase().includes('name')) {
        setDisplayNameError(msg);
        setShowNameTooltip(true);
      }
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setDiditVerified(false);
    setFullName('');
    setDisplayName('');
    setDisplayNameError(null);
    setShowNameTooltip(false);
    setError(null);
    window.history.replaceState({}, document.title, '/register');
  };

  if (checkingDidit) {
    return (
      <div className="register-page">
        <div className="register-container">
          <h1>Verifying Identity</h1>
          <p className="subtitle">Please wait while we confirm your identity verification...</p>
          <div className="loading-spinner" />
        </div>
        <style>{`
          .register-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }
          .register-container {
            background: white;
            border-radius: 16px;
            padding: 32px;
            width: 100%;
            max-width: 450px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
          }
          h1 {
            margin: 0 0 8px;
            color: #333;
          }
          .subtitle {
            color: #666;
            margin: 0 0 24px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <h1>{diditVerified ? 'Confirm Your Details' : 'Create Account'}</h1>
        <p className="subtitle">
          {diditVerified
            ? 'Review your information and create your account'
            : 'Join Veri Social today'}
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={diditVerified ? handleCreateAccount : handleInitiateDidit} className="register-form">
          <div className="form-group">
            <label>Profile Picture *</label>
            <div className="picture-upload" onClick={() => fileInputRef.current?.click()}>
              {picturePreview ? (
                <img src={picturePreview} alt="Profile preview" className="preview" />
              ) : (
                <div className="upload-placeholder">
                  <span>Click to upload photo</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {diditVerified && (
            <>
              <div className="form-group">
                <label htmlFor="displayName" className="label-with-info">
                  <span>Display Name *</span>
                  <span
                    className="info-icon"
                    onMouseEnter={() => setShowNameTooltip(true)}
                    onMouseLeave={() => !displayNameError && setShowNameTooltip(false)}
                    onClick={() => setShowNameTooltip(prev => !prev)}
                  >
                    &#9432;
                  </span>
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (displayNameError) setDisplayNameError(null);
                  }}
                  maxLength={CHAR_LIMITS.fullName}
                  placeholder="Enter your display name"
                  className={displayNameError ? 'input-error' : ''}
                />
                {(showNameTooltip || displayNameError) && (
                  <div className="name-tooltip">
                    <p><strong>Name requirements:</strong></p>
                    <ul>
                      <li>Must match your verified legal name</li>
                      <li>Your complete surname must be included</li>
                      <li>Middle names are optional</li>
                      <li>Common nicknames accepted (e.g. Mike &rarr; Michael, Mark &rarr; Markus)</li>
                      <li>Shortened forms accepted (e.g. John &rarr; Johnny)</li>
                      <li>Initials are OK for given names (e.g. J. Smith)</li>
                    </ul>
                    {displayNameError && (
                      <p className="tooltip-error">{displayNameError}</p>
                    )}
                  </div>
                )}
                <span className="char-count">{displayName.length}/{CHAR_LIMITS.fullName}</span>
              </div>

              <div className="form-group">
                <label htmlFor="fullName">Legal Name</label>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  disabled
                  className="disabled-input"
                />
                <span className="hint">Verified by Didit identity check</span>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="city">City</label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={CHAR_LIMITS.city}
              placeholder="Enter your city"
            />
            <span className="char-count">{city.length}/{CHAR_LIMITS.city}</span>
          </div>

          <div className="form-group">
            <label htmlFor="description">About You</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={CHAR_LIMITS.description}
              placeholder="Brief description or status"
              rows={3}
            />
            <span className="char-count">{description.length}/{CHAR_LIMITS.description}</span>
          </div>

          {diditVerified ? (
            <>
              <button type="submit" className="submit-button" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
              <button type="button" onClick={handleRetry} className="back-button">
                Restart Verification
              </button>
            </>
          ) : (
            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? 'Starting Verification...' : 'Verify Identity with Didit'}
            </button>
          )}
        </form>

        <p className="login-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>

      <style>{`
        .register-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .register-container {
          background: white;
          border-radius: 16px;
          padding: 32px;
          width: 100%;
          max-width: 450px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          text-align: center;
          margin: 0 0 8px;
          color: #333;
        }

        .subtitle {
          text-align: center;
          color: #666;
          margin: 0 0 24px;
        }

        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .register-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .label-with-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #667eea;
          color: white;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          user-select: none;
        }

        .info-icon:hover {
          background: #5568d3;
        }

        input, textarea {
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s;
        }

        input:focus, textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        input.input-error {
          border-color: #dc2626;
          background: #fef2f2;
        }

        input.input-error:focus {
          border-color: #dc2626;
        }

        input.disabled-input {
          background: #f5f5f5;
          color: #333;
          cursor: not-allowed;
        }

        .name-tooltip {
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 12px;
          font-size: 13px;
          color: #555;
        }

        .name-tooltip p {
          margin: 0 0 6px;
        }

        .name-tooltip ul {
          margin: 0;
          padding-left: 18px;
        }

        .name-tooltip li {
          margin-bottom: 4px;
        }

        .tooltip-error {
          color: #dc2626;
          font-weight: 600;
          margin-top: 8px !important;
        }

        .char-count, .hint {
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .hint {
          text-align: left;
        }

        .picture-upload {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          overflow: hidden;
          cursor: pointer;
          margin: 0 auto;
          border: 3px solid #e0e0e0;
        }

        .picture-upload img.preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .upload-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          color: #666;
          font-size: 14px;
          text-align: center;
        }

        .submit-button {
          padding: 14px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .submit-button:hover:not(:disabled) {
          background: #5568d3;
        }

        .submit-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .back-button {
          padding: 12px;
          background: transparent;
          color: #666;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .back-button:hover {
          background: #f5f5f5;
        }

        .login-link {
          text-align: center;
          margin-top: 20px;
          color: #666;
        }

        .login-link a {
          color: #667eea;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}

export default RegisterPage;
