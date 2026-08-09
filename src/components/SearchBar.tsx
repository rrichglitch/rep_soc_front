import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  onOptionsClick?: () => void;
}

function SearchBar({ onSearch, value, onChange, autoFocus, placeholder, className, onOptionsClick }: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;

  const setQuery = (newValue: string) => {
    if (!isControlled) {
      setInternalQuery(newValue);
    }
    onChange?.(newValue);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    if (newValue === '') {
      onSearch('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`search-bar ${className || ''}`}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder || 'Find people...'}
        className="search-input"
        autoFocus={autoFocus}
      />
      {onOptionsClick && (
        <button type="button" onClick={onOptionsClick} className="search-options-btn" aria-label="Search options">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="2" y1="4.5" x2="14" y2="4.5" />
            <circle cx="6" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
            <line x1="2" y1="8.5" x2="14" y2="8.5" />
            <circle cx="10" cy="8.5" r="1.7" fill="currentColor" stroke="none" />
            <line x1="2" y1="12.5" x2="14" y2="12.5" />
            <circle cx="5.5" cy="12.5" r="1.7" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
      <button type="submit" className="search-button">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>

      <style>{`
        .search-bar {
          display: flex;
          align-items: center;
          background: #f5f5f5;
          border-radius: 8px;
          overflow: hidden;
          width: 100%;
        }

        .search-input {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
          border: none;
          background: transparent;
          font-size: 14px;
          outline: none;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .search-input::placeholder {
          color: #999;
        }

        .search-options-btn {
          flex: 0 0 auto;
          padding: 10px 6px 10px 10px;
          background: transparent;
          border: none;
          color: #999;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .search-options-btn:hover { color: #667eea; }

        .search-button {
          flex: 0 0 auto;
          padding: 10px 10px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
        }

        .search-button:hover {
          color: #667eea;
        }
      `}</style>
    </form>
  );
}

export default SearchBar;
