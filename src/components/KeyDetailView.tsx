import React, { useState, useEffect } from 'react';
import { RedisKeyInfo, RedisType, StreamEntry } from '../types';
import { Clock, ShieldAlert, Plus, Trash2, ArrowDown, ArrowUp, Send, FileText, Sparkles, Hash } from 'lucide-react';

interface KeyDetailViewProps {
  keyInfo: RedisKeyInfo | null;
  onSaveString: (key: string, value: string) => void;
  onUpdateTTL: (key: string, ttl: number) => void;
  onDeleteKey: (key: string) => void;
  onUpdateCollection: (key: string, type: RedisType, updatedValue: any) => void;
}

export default function KeyDetailView({
  keyInfo,
  onSaveString,
  onUpdateTTL,
  onDeleteKey,
  onUpdateCollection,
}: KeyDetailViewProps) {
  const [ttlInput, setTtlInput] = useState<string>('');
  const [stringValue, setStringValue] = useState<string>('');

  // Hash state
  const [newHashField, setNewHashField] = useState('');
  const [newHashValue, setNewHashValue] = useState('');

  // List / Set / ZSet state
  const [newMemberValue, setNewMemberValue] = useState('');
  const [newZsetScore, setNewZsetScore] = useState<string>('0');

  // Stream state (XADD)
  const [streamFields, setStreamFields] = useState<{ key: string; value: string }[]>([
    { key: 'event', value: '' },
  ]);

  // Synchronize internal states on key selection change
  useEffect(() => {
    if (keyInfo) {
      setTtlInput(keyInfo.ttl !== -1 ? String(keyInfo.ttl) : '');
      if (keyInfo.type === 'string') {
        setStringValue(String(keyInfo.value || ''));
      }
    } else {
      setTtlInput('');
      setStringValue('');
    }
  }, [keyInfo]);

  if (!keyInfo) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col justify-center items-center text-center p-8" id="empty-detail-fallback">
        <FileText className="w-12 h-12 text-slate-300 mb-3" />
        <h3 className="text-sm font-semibold text-slate-700 font-display">No Key Selected</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
          Select a key from the database scan list to view, edit, or append values in real-time.
        </p>
      </div>
    );
  }

  const handleTtlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(ttlInput, 10);
    onUpdateTTL(keyInfo.key, isNaN(parsed) || parsed < 0 ? -1 : parsed);
  };

  const handleStringSave = () => {
    onSaveString(keyInfo.key, stringValue);
  };

  // HASH OPERATIONS
  const handleAddHashField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHashField.trim()) return;

    const currentHash = { ...(keyInfo.value || {}) };
    currentHash[newHashField.trim()] = newHashValue;

    onUpdateCollection(keyInfo.key, 'hash', currentHash);
    setNewHashField('');
    setNewHashValue('');
  };

  const handleDeleteHashField = (field: string) => {
    const currentHash = { ...(keyInfo.value || {}) };
    delete currentHash[field];
    onUpdateCollection(keyInfo.key, 'hash', currentHash);
  };

  const handleUpdateHashFieldInline = (field: string, val: string) => {
    const currentHash = { ...(keyInfo.value || {}) };
    currentHash[field] = val;
    onUpdateCollection(keyInfo.key, 'hash', currentHash);
  };

  // LIST OPERATIONS
  const handlePushList = (side: 'left' | 'right') => {
    if (!newMemberValue.trim()) return;
    const currentList = [...(keyInfo.value || [])];

    if (side === 'left') {
      currentList.unshift(newMemberValue);
    } else {
      currentList.push(newMemberValue);
    }

    onUpdateCollection(keyInfo.key, 'list', currentList);
    setNewMemberValue('');
  };

  const handleDeleteListItem = (index: number) => {
    const currentList = [...(keyInfo.value || [])];
    currentList.splice(index, 1);
    onUpdateCollection(keyInfo.key, 'list', currentList);
  };

  // SET OPERATIONS
  const handleAddSetMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberValue.trim()) return;

    const currentSet = [...(keyInfo.value || [])];
    if (!currentSet.includes(newMemberValue.trim())) {
      currentSet.push(newMemberValue.trim());
      onUpdateCollection(keyInfo.key, 'set', currentSet);
    }
    setNewMemberValue('');
  };

  const handleDeleteSetMember = (member: string) => {
    const currentSet = (keyInfo.value || []).filter((m: string) => m !== member);
    onUpdateCollection(keyInfo.key, 'set', currentSet);
  };

  // ZSET OPERATIONS
  const handleAddZsetMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberValue.trim()) return;

    const score = parseFloat(newZsetScore);
    if (isNaN(score)) return;

    const currentZset = [...(keyInfo.value || [])];
    const existingIdx = currentZset.findIndex((item: any) => item.value === newMemberValue.trim());

    if (existingIdx !== -1) {
      currentZset[existingIdx].score = score;
    } else {
      currentZset.push({ value: newMemberValue.trim(), score });
    }

    // Sort ascending by score
    currentZset.sort((a, b) => a.score - b.score);

    onUpdateCollection(keyInfo.key, 'zset', currentZset);
    setNewMemberValue('');
    setNewZsetScore('0');
  };

  const handleDeleteZsetMember = (val: string) => {
    const currentZset = (keyInfo.value || []).filter((item: any) => item.value !== val);
    onUpdateCollection(keyInfo.key, 'zset', currentZset);
  };

  // STREAM OPERATIONS (XADD)
  const handleAddStreamFieldRow = () => {
    setStreamFields([...streamFields, { key: '', value: '' }]);
  };

  const handleRemoveStreamFieldRow = (index: number) => {
    setStreamFields(streamFields.filter((_, i) => i !== index));
  };

  const handleStreamFieldChange = (index: number, fKey: 'key' | 'value', text: string) => {
    const updated = [...streamFields];
    updated[index][fKey] = text;
    setStreamFields(updated);
  };

  const handleXAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const fieldsMap: Record<string, string> = {};
    let validCount = 0;

    for (const f of streamFields) {
      if (f.key.trim()) {
        fieldsMap[f.key.trim()] = f.value;
        validCount++;
      }
    }

    if (validCount === 0) return;

    // Send payload. We expect the reducer/parent to pass XADD format: { id: '*', fields: fieldsMap }
    const xaddPayload = {
      id: '*',
      fields: fieldsMap,
    };

    onUpdateCollection(keyInfo.key, 'stream', xaddPayload);
    // Reset inputs
    setStreamFields([{ key: 'event', value: '' }]);
  };

  const getTypeColor = (type: RedisType) => {
    switch (type) {
      case 'string': return 'text-cyan-600 bg-cyan-50 border-cyan-200';
      case 'hash': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'list': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'set': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'zset': return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'stream': return 'text-indigo-600 bg-indigo-50 border-indigo-200';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col overflow-hidden" id={`key-details-${keyInfo.key}`}>
      {/* Header Info */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getTypeColor(keyInfo.type)}`}>
              {keyInfo.type}
            </span>
            <h2 className="text-sm font-bold text-slate-800 font-mono truncate max-w-[200px] sm:max-w-md" title={keyInfo.key}>
              {keyInfo.key}
            </h2>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-3">
            <span>Size: <span className="font-semibold text-slate-600 font-mono">{keyInfo.size}</span></span>
            <span>Created: <span className="text-slate-500 font-mono">Sandbox Local Session</span></span>
          </div>
        </div>

        {/* Quick Delete */}
        <button
          onClick={() => {
            if (confirm(`Delete key "${keyInfo.key}" from Valkey / Redis?`)) {
              onDeleteKey(keyInfo.key);
            }
          }}
          className="text-xs text-rose-600 hover:text-white border border-rose-200 hover:bg-rose-500 py-1 px-2.5 rounded-lg transition-all flex items-center gap-1 shrink-0 self-start md:self-center"
          id="btn-delete-details"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Key
        </button>
      </div>

      {/* TTL Center & Editor */}
      <div className="p-3 bg-slate-50 border-b border-slate-150 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>TTL Status:</span>
          {keyInfo.ttl > 0 ? (
            <span className="font-semibold text-amber-600 font-mono bg-amber-50 px-1.5 py-0.5 border border-amber-100 rounded">{keyInfo.ttl} seconds remaining</span>
          ) : (
            <span className="text-slate-400 font-mono">Persistent (No Expiry)</span>
          )}
        </div>

        <form onSubmit={handleTtlSubmit} className="flex items-center gap-1.5 text-xs">
          <input
            type="number"
            className="w-20 px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:border-indigo-500 text-slate-700 font-mono text-[11px]"
            placeholder="TTL (sec)"
            value={ttlInput}
            onChange={(e) => setTtlInput(e.target.value)}
            id="input-ttl-details"
          />
          <button
            type="submit"
            className="bg-white hover:bg-slate-50 border border-slate-200 py-1 px-2.5 rounded-md text-slate-600 font-medium transition-colors text-[11px]"
            id="btn-update-ttl-details"
          >
            Set TTL
          </button>
          <button
            type="button"
            onClick={() => onUpdateTTL(keyInfo.key, -1)}
            className="text-[11px] text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors font-medium"
            id="btn-persist-details"
          >
            Persist
          </button>
        </form>
      </div>

      {/* VALUE EDITOR DEPENDING ON TYPE */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* STRING EDITOR */}
        {keyInfo.type === 'string' && (
          <div className="space-y-3" id="string-editor">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">String Value</label>
              <textarea
                className="w-full h-64 text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-700 leading-relaxed shadow-inner"
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                placeholder="Enter string value data..."
                id="textarea-string-val"
              />
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400">
                Length: <span className="font-mono font-bold text-slate-600">{stringValue.length}</span> bytes
              </span>
              <button
                onClick={handleStringSave}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1 px-4 rounded-lg text-xs transition-colors shadow-sm"
                id="btn-save-string-details"
              >
                Save Value
              </button>
            </div>
          </div>
        )}

        {/* HASH EDITOR */}
        {keyInfo.type === 'hash' && (
          <div className="space-y-4" id="hash-editor">
            {/* Add new field form */}
            <form onSubmit={handleAddHashField} className="flex gap-2 p-3 bg-slate-50 border border-slate-150 rounded-xl">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Field name"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 font-mono"
                  value={newHashField}
                  onChange={(e) => setNewHashField(e.target.value)}
                  required
                  id="input-hash-field"
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Field value"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700"
                  value={newHashValue}
                  onChange={(e) => setNewHashValue(e.target.value)}
                  id="input-hash-value"
                />
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm shrink-0"
                id="btn-add-hash-field"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Field
              </button>
            </form>

            {/* Fields List */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Hash Fields ({Object.keys(keyInfo.value || {}).length})</label>
              {Object.keys(keyInfo.value || {}).length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                  Hash is empty. Add a field above.
                </div>
              ) : (
                <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {Object.entries(keyInfo.value || {}).map(([f, v]) => (
                    <div key={f} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50">
                      <div className="flex-1 min-w-0 grid grid-cols-12 gap-2">
                        <div className="col-span-4 font-mono text-xs font-semibold text-slate-600 truncate border-r border-slate-100 pr-1" title={f}>
                          {f}
                        </div>
                        <div className="col-span-8">
                          <input
                            type="text"
                            className="w-full text-xs bg-transparent border-0 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 px-1 py-0.5 rounded text-slate-700 truncate"
                            value={String(v)}
                            onChange={(e) => handleUpdateHashFieldInline(f, e.target.value)}
                            id={`hash-val-input-${f}`}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteHashField(f)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100"
                        title="Delete Field"
                        id={`btn-del-hash-field-${f}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIST EDITOR */}
        {keyInfo.type === 'list' && (
          <div className="space-y-4" id="list-editor">
            {/* Add list item form */}
            <div className="flex gap-2 p-3 bg-slate-50 border border-slate-150 rounded-xl">
              <input
                type="text"
                placeholder="List item value..."
                className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700"
                value={newMemberValue}
                onChange={(e) => setNewMemberValue(e.target.value)}
                id="input-list-val"
              />
              <button
                onClick={() => handlePushList('left')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm shrink-0"
                id="btn-lpush"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                LPUSH
              </button>
              <button
                onClick={() => handlePushList('right')}
                className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm shrink-0"
                id="btn-rpush"
              >
                RPUSH
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List entries */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">List Elements (Index order, {Array.isArray(keyInfo.value) ? keyInfo.value.length : 0})</label>
              {!Array.isArray(keyInfo.value) || keyInfo.value.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                  List is empty. LPUSH/RPUSH above.
                </div>
              ) : (
                <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {keyInfo.value.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 font-mono text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 py-0.5 px-1.5 rounded w-7 text-center shrink-0">
                          {idx}
                        </span>
                        <span className="text-slate-700 truncate" title={String(item)}>
                          "{String(item)}"
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteListItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 shrink-0"
                        id={`btn-del-list-item-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SET EDITOR */}
        {keyInfo.type === 'set' && (
          <div className="space-y-4" id="set-editor">
            {/* Add member */}
            <form onSubmit={handleAddSetMember} className="flex gap-2 p-3 bg-slate-50 border border-slate-150 rounded-xl">
              <input
                type="text"
                placeholder="New Set member value..."
                className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 font-mono"
                value={newMemberValue}
                onChange={(e) => setNewMemberValue(e.target.value)}
                required
                id="input-set-member"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm shrink-0"
                id="btn-add-set-member"
              >
                <Plus className="w-3.5 h-3.5" />
                SADD Member
              </button>
            </form>

            {/* Set Members list */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Set Members ({Array.isArray(keyInfo.value) ? keyInfo.value.length : 0})</label>
              {!Array.isArray(keyInfo.value) || keyInfo.value.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                  Set is empty. SADD members above.
                </div>
              ) : (
                <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {keyInfo.value.map((member: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 font-mono text-xs">
                      <span className="text-slate-700 truncate" title={String(member)}>
                        "{String(member)}"
                      </span>
                      <button
                        onClick={() => handleDeleteSetMember(member)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 shrink-0"
                        id={`btn-del-set-member-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ZSET EDITOR */}
        {keyInfo.type === 'zset' && (
          <div className="space-y-4" id="zset-editor">
            {/* Add zset score + value */}
            <form onSubmit={handleAddZsetMember} className="flex gap-2 p-3 bg-slate-50 border border-slate-150 rounded-xl">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="ZSet Member value"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 font-mono"
                  value={newMemberValue}
                  onChange={(e) => setNewMemberValue(e.target.value)}
                  required
                  id="input-zset-val"
                />
              </div>
              <div className="w-28">
                <input
                  type="number"
                  step="any"
                  placeholder="Score"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700 font-mono"
                  value={newZsetScore}
                  onChange={(e) => setNewZsetScore(e.target.value)}
                  required
                  id="input-zset-score"
                />
              </div>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm shrink-0"
                id="btn-add-zset"
              >
                <Plus className="w-3.5 h-3.5" />
                ZADD Score
              </button>
            </form>

            {/* ZSet Table */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Sorted Set Rankings ({Array.isArray(keyInfo.value) ? keyInfo.value.length : 0})</label>
              {!Array.isArray(keyInfo.value) || keyInfo.value.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                  Sorted Set is empty. ZADD elements above.
                </div>
              ) : (
                <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {keyInfo.value.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 font-mono text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[10px] font-bold text-slate-500 bg-rose-50 border border-rose-100 py-0.5 px-2 rounded-full shrink-0">
                          Score: {item.score}
                        </span>
                        <span className="text-slate-700 truncate" title={String(item.value)}>
                          "{String(item.value)}"
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteZsetMember(item.value)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 shrink-0"
                        id={`btn-del-zset-${idx}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* REDIS STREAMS MONITOR (timeline view + XADD) */}
        {keyInfo.type === 'stream' && (
          <div className="space-y-4" id="stream-editor">
            {/* Append (XADD) stream entry section */}
            <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-semibold text-indigo-900">XADD - Append Stream Entry</h3>
              </div>

              <form onSubmit={handleXAdd} className="space-y-2">
                {streamFields.map((f, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Field Key (e.g. event)"
                      className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-slate-700"
                      value={f.key}
                      onChange={(e) => handleStreamFieldChange(idx, 'key', e.target.value)}
                      required
                      id={`stream-fkey-${idx}`}
                    />
                    <input
                      type="text"
                      placeholder="Field Value"
                      className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700"
                      value={f.value}
                      onChange={(e) => handleStreamFieldChange(idx, 'value', e.target.value)}
                      id={`stream-fval-${idx}`}
                    />
                    {streamFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStreamFieldRow(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg border border-transparent hover:border-slate-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex justify-between items-center pt-1.5">
                  <button
                    type="button"
                    onClick={handleAddStreamFieldRow}
                    className="text-[11px] text-indigo-600 hover:text-indigo-700 hover:underline font-semibold flex items-center gap-1"
                    id="btn-add-stream-field-row"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add field column
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-4 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                    id="btn-submit-xadd"
                  >
                    <Send className="w-3 h-3" />
                    XADD Entry (*)
                  </button>
                </div>
              </form>
            </div>

            {/* Stream timeline list */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Stream Event Logs (Chronological, max 100 entries)
              </label>

              {!Array.isArray(keyInfo.value) || keyInfo.value.length === 0 ? (
                <div className="p-10 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                  Stream has no entries. Trigger an XADD above or wait for sandbox simulator logs.
                </div>
              ) : (
                <div className="space-y-2.5" id="stream-timeline">
                  {keyInfo.value
                    .slice()
                    .reverse()
                    .map((entry: StreamEntry, idx: number) => (
                      <div
                        key={entry.id || idx}
                        className="border border-slate-150 bg-slate-50/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 relative hover:border-indigo-150 transition-colors"
                      >
                        {/* Event ID and timestamps */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping shrink-0" />
                            <span className="text-xs font-bold text-slate-700 font-mono select-all bg-slate-100 px-1.5 py-0.5 rounded">
                              {entry.id}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {/* convert milliseconds to readable timestamp */}
                              {(() => {
                                const msStr = entry.id.split('-')[0];
                                const ms = parseInt(msStr, 10);
                                return !isNaN(ms) && ms > 1000000000000
                                  ? new Date(ms).toLocaleTimeString()
                                  : '';
                              })()}
                            </span>
                          </div>

                          {/* Render fields */}
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2 text-[11px]">
                            {Object.entries(entry.fields || {}).map(([fk, fv]) => (
                              <div key={fk} className="flex items-baseline gap-1.5 min-w-0">
                                <span className="font-semibold text-indigo-700 font-mono shrink-0 select-all">{fk}:</span>
                                <span className="text-slate-600 font-mono truncate" title={fv}>
                                  "{fv}"
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Order indicator */}
                        <div className="absolute top-2.5 right-3 text-[9px] font-bold text-indigo-400 bg-indigo-50/50 px-1.5 py-0.5 rounded uppercase">
                          {idx === 0 ? 'Latest' : `+${idx}`}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
