import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from '../config';
import { useApp } from '../App';
import { fileToBase64, isFileSizeValid, isFileTypeValid, validateAndSanitizeFullName, validateAndSanitizeCity, validateAndSanitizeDescription } from '../utils/sanitize';
import { sendVerificationCode, verifyPhoneCode } from '../utils/spacetime';

const RESEND_COOLDOWN_SECONDS = 60;

function RegisterPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { email, setHasProfile } = useApp();

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedPictureBase64, setStoredPictureBase64] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [storedPhone, setStoredPhone] = useState('');

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
      
      // Convert to base64 for storage
      const base64 = await fileToBase64(file);
      setStoredPictureBase64(base64);
      setError(null);
    }
  };

  const handleSendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate inputs
      const sanitizedFullName = validateAndSanitizeFullName(fullName);
      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      if (!storedPictureBase64) {
        throw new Error('Profile picture is required');
      }

      if (!email) {
        throw new Error('Email not available. Please log in again.');
      }

      // Validate phone number format (basic E.164 check)
      const phone = phoneNumber.trim();
      if (!phone.startsWith('+') || phone.length < 10) {
        throw new Error('Please enter a valid phone number with country code (e.g., +14155551234)');
      }

      // Send verification code via Twilio (backend procedure validates all fields first)
      console.log('Calling sendVerificationCode with phone:', phone);
      await sendVerificationCode(
        email,
        sanitizedFullName,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription,
        phone
      );
      console.log('sendVerificationCode completed, moving to verify step');
      
      setStep('verify');
      setStoredPhone(phone);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setIsLoading(false);
    } catch (err) {
      console.error('sendVerificationCode error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !email || !storedPictureBase64) return;
    
    setError(null);
    setIsLoading(true);

    try {
      console.log('Resending verification code to:', storedPhone);
      const sanitizedFullName = validateAndSanitizeFullName(fullName);
      const sanitizedCity = validateAndSanitizeCity(city);
      const sanitizedDescription = validateAndSanitizeDescription(description);

      await sendVerificationCode(
        email,
        sanitizedFullName,
        storedPictureBase64,
        sanitizedCity,
        sanitizedDescription,
        storedPhone
      );
      console.log('Resend successful');
      
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setVerificationCode('');
      setIsLoading(false);
    } catch (err) {
      console.error('Resend error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const handleVerifyAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await verifyPhoneCode(
        storedPhone,
        verificationCode.trim()
      );

      // Wait for subscription to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mark that user has a profile
      setHasProfile(true);

      // Navigate to feed
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('form');
    setVerificationCode('');
    setResendCooldown(0);
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <h1>{step === 'form' ? 'Create Account' : 'Verify Phone'}</h1>
        <p className="subtitle">{step === 'form' ? 'Join Reputable Social today' : `Enter the code sent to ${phoneNumber}`}</p>

        {error && <div className="error-message">{error}</div>}

        {step === 'form' ? (
          <form onSubmit={handleSendVerification} className="register-form">
            <div className="form-group">
              <label htmlFor="fullName">Full Name *</label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={CHAR_LIMITS.fullName}
                required
                placeholder="Enter your full name"
              />
              <span className="char-count">{fullName.length}/{CHAR_LIMITS.fullName}</span>
            </div>

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
              <label htmlFor="phoneNumber">Phone Number *</label>
              <input
                type="tel"
                id="phoneNumber"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                placeholder="+14155551234"
              />
              <span className="hint">Include country code (e.g., +1 for US)</span>
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

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndCreate} className="register-form">
            <div className="form-group">
              <label htmlFor="verificationCode">Verification Code *</label>
              <input
                type="text"
                id="verificationCode"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                required
                placeholder="Enter 6-digit code"
                className="verification-input"
              />
              <span className="hint">Check your phone for a 6-digit code</span>
            </div>

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify & Create Account'}
            </button>

            <div className="resend-section">
              <span className="hint">Didn't receive a code?</span>
              {resendCooldown > 0 ? (
                <span className="cooldown-text">Resend in {resendCooldown}s</span>
              ) : (
                <button type="button" onClick={handleResendCode} className="resend-button" disabled={isLoading}>
                  Resend Code
                </button>
              )}
            </div>

            <button type="button" onClick={handleBack} className="back-button">
              Back
            </button>
          </form>
        )}

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

        .verification-input {
          text-align: center;
          font-size: 24px;
          letter-spacing: 4px;
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

        .resend-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .cooldown-text {
          font-size: 14px;
          color: #999;
        }

        .resend-button {
          background: transparent;
          border: none;
          color: #667eea;
          font-size: 14px;
          cursor: pointer;
          padding: 8px;
        }

        .resend-button:hover:not(:disabled) {
          text-decoration: underline;
        }

        .resend-button:disabled {
          color: #ccc;
          cursor: not-allowed;
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