import { useState, type ReactNode } from 'react';

interface TopBarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  hasSearch?: boolean;
}

function TopBar({ left, center, right, className = '', hasSearch = false }: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className={`topbar ${className}`}>
      <div className="topbar-left">{left}</div>
      <div className="topbar-center">
        <div className="topbar-center-inner">{center}</div>
        {searchOpen && hasSearch && (
          <div className="topbar-center-overlay">{center}</div>
        )}
      </div>
      <div className="topbar-right">
        {right}
        {hasSearch && (
          <button
            type="button"
            className="topbar-search-toggle"
            aria-label="Toggle search"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {searchOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      <style>{`
        .topbar {
          position: sticky;
          top: 0;
          background: white;
          height: 60px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
          box-sizing: border-box;
        }
        .topbar-left {
          display: flex;
          align-items: center;
          flex: 1;
          justify-content: flex-start;
          min-width: 0;
        }
        .topbar-center {
          flex: 1 1 auto;
          text-align: center;
          display: flex;
          justify-content: center;
          padding: 0;
          min-width: 0;
          position: relative;
        }
        .topbar-center-inner {
          display: flex;
          justify-content: center;
          width: 100%;
          min-width: 0;
        }
        .topbar-center-overlay {
          display: none;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex: 1;
          gap: 8px;
        }
        .topbar-logo {
          display: flex;
          align-items: center;
          text-decoration: none;
        }
        .topbar-logo img {
          height: 36px;
          width: auto;
          display: block;
        }
        .topbar-back {
          color: #667eea;
          background: none;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
        }
        .topbar-back:hover {
          color: #5a6fd6;
        }
        .topbar-signin {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .topbar-signin:hover {
          background: #5a6fd6;
        }
        .topbar-profile-link {
          display: block;
        }
        .topbar-profile-image {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }
        .topbar-profile-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e0e0;
        }
        .topbar-search-toggle {
          display: none;
          padding: 8px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          border-radius: 8px;
        }
        .topbar-search-toggle:hover {
          background: #f5f5f5;
          color: #667eea;
        }
        @media (max-width: 640px) {
          .topbar {
            padding: 0 12px;
          }
          .topbar-center-inner {
            display: none;
          }
          .topbar-center-overlay {
            display: block;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            padding: 8px 12px 12px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            z-index: 99;
            box-sizing: border-box;
          }
          .topbar-search-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </header>
  );
}

export default TopBar;
