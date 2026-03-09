import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from '../config';
import { useApp } from '../App';
import { fileToBase64, isFileSizeValid, isFileTypeValid, validateAndSanitizeFullName, validateAndSanitizeCity, validateAndSanitizeDescription } from '../utils/sanitize';

function RegisterPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { email, createProfile, setHasProfile } = useApp();

  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate inputs
      validateAndSanitizeFullName(fullName);
      validateAndSanitizeCity(city);
      validateAndSanitizeDescription(description);

      if (!profilePicture) {
        throw new Error('Profile picture is required');
      }

      if (!email) {
        throw new Error('Email not available. Please log in again.');
      }

      console.log('Creating profile for email:', email);

      // Convert picture to base64
      const pictureBase64 = await fileToBase64(profilePicture);

      // Call the createProfile reducer to store in SpaceTimeDB
      await createProfile(
        validateAndSanitizeFullName(fullName),
        pictureBase64,
        validateAndSanitizeCity(city),
        validateAndSanitizeDescription(description)
      );

      // Wait for subscription to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mark that user has a profile
      setHasProfile(true);

      // Navigate to home
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <h1>Create Account</h1>
        <p className="subtitle">Join Reputable Social today</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="register-form">
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
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
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

        .char-count {
          font-size: 12px;
          color: #999;
          text-align: right;
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
