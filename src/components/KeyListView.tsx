import React, { useState, useEffect } from 'react';
import { RedisKeyInfo, RedisType } from '../types';
import { Search, Plus, Trash2, Clock, Eye, SlidersHorizontal, RefreshCw, Layers } from 'lucide-react';

interface KeyListViewProps {
  keys: RedisKeyInfo[];
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onDeleteKey: (key: string) => void;
  onCreateKey: (key: string, type: RedisType, value: any, ttl?: number) => void;
  onRefresh: () => void;
  isScanning: boolean;
  onSearchChange: (pattern: string, typeFilter: string) => void;
}

export default function KeyListView({
  keys,
  selectedKey,
  onSelectKey,
  onDeleteKey,
  onCreateKey,
  onRefresh,
  isScanning,
  onSearchChange,
}: KeyListViewProps) {
  const [pattern, setPattern] = useState('*');
  const [typeFilter, setTypeFilter] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // New key form state
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<RedisType>('string');
  const [newKeyTTL, setNewKeyTTL] = useState<number | ''>('');
  const [newKeyValue, setNewKeyValue] = useState('');

  // Submit search on change/enter
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      onSearchChange(pattern, typeFilter);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [pattern, typeFilter]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    let initialValue: any = '';
    if (newKeyType === 'string') {
      initialValue = newKeyValue || 'empty';
    } else if (newKeyType === 'hash') {
      initialValue = { created_at: new Date().toISOString() };
    } else if (newKeyType === 'list') {
      initialValue = newKeyValue ? [newKeyValue] : ['item-1'];
    } else if (newKeyType === 'set') {
      initialValue = newKeyValue ? [newKeyValue] : ['member-1'];
    } else if (newKeyType === 'zset') {
      initialValue = [{ value: newKeyValue || 'member-1', score: 10 }];
    } else if (newKeyType === 'stream') {
      initialValue = [
        {
          id: `${Date.now()}-0`,
          fields: { source: 'initializer', message: newKeyValue || 'stream_created' },
        },
      ];
    }

    onCreateKey(
      newKeyName.trim(),
      newKeyType,
      initialValue,
      newKeyTTL === '' ? -1 : newKeyTTL
    );

    // Reset form
    setNewKeyName('');
    setNewKeyTTL('');
    setNewKeyValue('');
    setIsAdding(false);
  };

  const getTypeStyles = (type: RedisType) => {
    switch (type) {
      case 'string':
        return 'bg-green-950/30 text-green-400 border-green-900/50';
      case 'hash':
        return 'bg-amber-950/30 text-amber-400 border-amber-900/50';
      case 'list':
        return 'bg-blue-950/30 text-blue-400 border-blue-900/50';
      case 'set':
        return 'bg-purple-950/30 text-purple-400 border-purple-900/50';
      case 'zset':
        return 'bg-rose-950/30 text-rose-400 border-rose-900/50';
      case 'stream':
        return 'bg-cyan-950/30 text-cyan-400 border-cyan-900/50';
      default:
        return 'bg-neutral-900 text-neutral-400 border-neutral-800';
    }
  };

  return (
    <div className="bg-[#0F0F0F] border border-neutral-800 rounded-xl shadow-md shadow-black/25 h-full flex flex-col overflow-hidden" id="key-list-view">
      {/* Title & Scan Info */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-[#121212]/90">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-red-500" />
          <h2 className="text-sm font-semibold text-white font-display">
            Keys Space <span className="text-xs font-normal text-neutral-500">({keys.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefresh}
            disabled={isScanning}
            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-850 rounded-lg transition-all cursor-pointer"
            title="Scan Database"
            id="btn-refresh-scan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-red-500' : ''}`} />
          </button>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className={`p-1.5 rounded-lg border flex items-center gap-1 transition-all text-xs font-medium cursor-pointer ${
              isAdding
                ? 'bg-neutral-800 border-neutral-700 text-neutral-200'
                : 'bg-red-600 border-red-700 text-white hover:bg-red-500'
            }`}
            id="btn-toggle-add-key"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Key
          </button>
        </div>
      </div>

      {/* Add Key Panel */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-4 border-b border-neutral-800 bg-[#121212]/30 shrink-0 space-y-3" id="add-key-form">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Key Name</label>
              <input
                type="text"
                placeholder="users:active"
                className="w-full text-xs px-2.5 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-200 font-mono"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                required
                id="form-key-name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Key Type</label>
              <select
                className="w-full text-xs px-2 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-250 font-semibold"
                value={newKeyType}
                onChange={(e) => setNewKeyType(e.target.value as RedisType)}
                id="form-key-type"
              >
                <option value="string">String</option>
                <option value="hash">Hash</option>
                <option value="list">List</option>
                <option value="set">Set</option>
                <option value="zset">Sorted Set</option>
                <option value="stream">Stream</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                {newKeyType === 'string' ? 'Initial Value' : 'First Element (Optional)'}
              </label>
              <input
                type="text"
                placeholder={newKeyType === 'string' ? 'Value data' : 'Value or field message'}
                className="w-full text-xs px-2.5 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-200"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                id="form-key-val"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">TTL (Seconds, Optional)</label>
              <input
                type="number"
                placeholder="Infinite"
                className="w-full text-xs px-2.5 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-200 font-mono"
                value={newKeyTTL}
                onChange={(e) => setNewKeyTTL(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                id="form-key-ttl"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1 justify-end">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1 text-xs border border-neutral-800 rounded-md hover:bg-neutral-800 text-neutral-400 transition-colors cursor-pointer"
              id="form-btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white font-medium rounded-md transition-colors cursor-pointer"
              id="form-btn-submit"
            >
              Create Key
            </button>
          </div>
        </form>
      )}

      {/* Filter and Scan Controls */}
      <div className="p-3 bg-[#121212]/60 border-b border-neutral-800 flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 font-mono text-neutral-200"
            placeholder="Glob pattern (e.g. user:* or *)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            id="search-pattern-input"
          />
        </div>

        {/* Horizontal Type Badges */}
        <div className="flex gap-1.5 items-center overflow-x-auto pb-1 select-none">
          <SlidersHorizontal className="w-3 h-3 text-neutral-500 shrink-0" />
          <button
            onClick={() => setTypeFilter('')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-all cursor-pointer ${
              typeFilter === ''
                ? 'bg-red-950/40 text-red-400 border-red-900/50'
                : 'bg-[#0D0D0D] text-neutral-400 border-neutral-800 hover:bg-[#1A1A1A]'
            }`}
          >
            All
          </button>
          {(['string', 'hash', 'list', 'set', 'zset', 'stream'] as RedisType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-all capitalize cursor-pointer ${
                typeFilter === t
                  ? getTypeStyles(t)
                  : 'bg-[#0D0D0D] text-neutral-400 border-neutral-800 hover:bg-[#1A1A1A]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Keys List */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-900/40">
        {keys.length === 0 ? (
          <div className="p-8 text-center text-neutral-500" id="no-keys-fallback">
            <Search className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <p className="text-xs font-medium">No keys found</p>
            <p className="text-[10px] text-neutral-500 mt-0.5">
              Change the search pattern or filter, or click "Add Key" to create one.
            </p>
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.key}
              onClick={() => onSelectKey(k.key)}
              className={`p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-[#121212]/50 ${
                selectedKey === k.key ? 'bg-neutral-900/40 border-r-2 border-red-500' : ''
              }`}
              id={`key-row-${k.key}`}
            >
              <div className="min-w-0 pr-2">
                {/* Type & Name */}
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase border shrink-0 ${getTypeStyles(k.type)}`}>
                    {k.type}
                  </span>
                  <span className="text-xs font-semibold text-neutral-200 truncate font-mono" title={k.key}>
                    {k.key}
                  </span>
                </div>

                {/* Info summary */}
                <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1">
                  {k.ttl > 0 ? (
                    <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                      <Clock className="w-3 h-3 shrink-0" />
                      {k.ttl}s
                    </span>
                  ) : (
                    <span className="text-neutral-600">no ttl</span>
                  )}
                  <span>
                    Size: <span className="font-semibold text-neutral-400 font-mono">{k.size}</span>
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectKey(k.key);
                  }}
                  className="p-1 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-md cursor-pointer"
                  title="View Details"
                  id={`btn-view-${k.key}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete key "${k.key}"?`)) {
                      onDeleteKey(k.key);
                    }
                  }}
                  className="p-1 text-neutral-500 hover:text-red-400 hover:bg-red-950/30 rounded-md cursor-pointer"
                  title="Delete Key"
                  id={`btn-delete-${k.key}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
