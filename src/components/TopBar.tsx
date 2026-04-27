import type { ReactNode } from 'react';

interface TopBarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}

function TopBar({ left, center, right, className = '' }: TopBarProps) {
  return (
    <header className={`topbar ${className}`}>
      <div className="topbar-left">{left}</div>
      <div className="topbar-center">{center}</div>
      <div className="topbar-right">{right}</div>

      <style>{`
        .topbar {
          position: sticky;
          top: 0;
          background: white;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
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
          padding: 0 16px;
          min-width: 0;
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
            padding: 10px 16px;
          }
          .topbar-search-toggle {
            display: block;
          }
        }
      `}</style>
    </header>
  );
}

export default TopBar;
