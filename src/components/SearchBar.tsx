import { useState } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value === '') {
      onSearch('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="search-bar">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Find people..."
        className="search-input"
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
