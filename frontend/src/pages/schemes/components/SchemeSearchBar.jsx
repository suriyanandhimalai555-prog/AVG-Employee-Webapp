import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

export const SchemeSearchBar = ({ onSearch, placeholder = 'Search name or phone…' }) => {
  const [inputValue, setInputValue] = useState('');
  const debounced = useDebouncedValue(inputValue, 300);

  // Notify parent whenever debounced value settles
  useEffect(() => { onSearch(debounced); }, [debounced]);

  const clear = () => {
    setInputValue('');
    onSearch('');
  };

  return (
    // role="search" marks the widget as a search landmark for screen readers.
    <div className="relative" role="search">
      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" aria-hidden="true" />
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        // Esc key clears the field — a standard keyboard shortcut for search inputs.
        onKeyDown={e => { if (e.key === 'Escape') clear(); }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-10 pr-9 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 card-shadow"
      />
      {inputValue && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/30 hover:text-navy/60"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default SchemeSearchBar;
