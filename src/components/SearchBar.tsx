import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

function SearchBar({ onSearch, value, onChange, autoFocus, placeholder, className }: SearchBarProps) {
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
          padding: 10px 14px;
          border: none;
          background: transparent;
          font-size: 14px;
          outline: none;
        }

        .search-input::placeholder {
          color: #999;
        }

        .search-button {
          padding: 10px 14px;
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
