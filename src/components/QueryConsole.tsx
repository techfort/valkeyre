import React, { useState, useRef, useEffect } from 'react';
import { QueryLog } from '../types';
import { Terminal, Send, Trash2, HelpCircle } from 'lucide-react';

interface QueryConsoleProps {
  history: QueryLog[];
  onRunQuery: (command: string) => void;
  onClearHistory: () => void;
  isPending: boolean;
}

const VALKEY_COMMANDS = [
  'PING', 'KEYS', 'GET', 'SET', 'DEL', 'EXISTS', 'EXPIRE', 'TTL', 'PERSIST',
  'INCR', 'DECR', 'DBSIZE', 'INFO', 'FLUSHALL', 'FLUSHDB',
  'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'LINDEX', 'LSET',
  'SADD', 'SREM', 'SISMEMBER', 'SMEMBERS', 'SCARD', 'SUNION', 'SINTER',
  'HSET', 'HGET', 'HDEL', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS',
  'ZADD', 'ZRANGE', 'ZREM', 'ZCARD', 'ZSCORE', 'ZRANK',
  'PUBLISH', 'SUBSCRIBE', 'UNSUBSCRIBE', 'PSUBSCRIBE', 'PUNSUBSCRIBE',
  'XADD', 'XREAD', 'XRANGE', 'XLEN', 'XREVRANGE', 'XGROUP', 'XREADGROUP',
  'CONFIG', 'CLIENT', 'MONITOR', 'SLOWLOG', 'COMMAND', 'AUTH', 'SELECT'
];

export default function QueryConsole({
  history,
  onRunQuery,
  onClearHistory,
  isPending,
}: QueryConsoleProps) {
  const [commandInput, setCommandInput] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of terminal whenever history updates
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setHideSuggestions(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isPending) return;
    onRunQuery(commandInput.trim());
    setCommandInput('');
    setHideSuggestions(true);
  };

  const handleSnippetClick = (snippet: string) => {
    setCommandInput(snippet);
    setHideSuggestions(true);
  };

  // Get autocomplete suggestions
  const parts = commandInput.trimStart().split(/\s+/);
  const isTypingCommand = parts.length === 1 && commandInput.trimStart() !== '';
  const currentWord = isTypingCommand ? parts[0].toUpperCase() : '';

  const suggestions = currentWord
    ? VALKEY_COMMANDS.filter((cmd) => cmd.startsWith(currentWord))
    : [];

  const visibleSuggestions = suggestions.slice(0, 8);

  const applySuggestion = (cmd: string) => {
    setCommandInput(cmd + ' ');
    setSelectedSuggestionIndex(0);
    setHideSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visibleSuggestions.length === 0 || hideSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev + 1) % visibleSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev - 1 + visibleSuggestions.length) % visibleSuggestions.length);
    } else if (e.key === 'Enter') {
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < visibleSuggestions.length) {
        e.preventDefault();
        applySuggestion(visibleSuggestions[selectedSuggestionIndex]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(visibleSuggestions[selectedSuggestionIndex] || visibleSuggestions[0]);
    } else if (e.key === 'Escape') {
      setHideSuggestions(true);
    }
  };

  const commandSnippets = [
    { label: 'PING', cmd: 'PING' },
    { label: 'KEYS *', cmd: 'KEYS *' },
    { label: 'DBSIZE', cmd: 'DBSIZE' },
    { label: 'INFO', cmd: 'INFO' },
    { label: 'FLUSHALL', cmd: 'FLUSHALL' },
  ];

  return (
    <div className="bg-[#0F0F0F] border border-neutral-800 rounded-xl shadow-md shadow-black/25 h-full flex flex-col overflow-hidden text-neutral-100" id="query-console" ref={containerRef}>
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 bg-[#121212]/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-red-500" />
          <h2 className="text-sm font-semibold font-display text-white">ValKey / Redis Query Editor Terminal</h2>
        </div>
        {history.length > 0 && (
          <button
            onClick={onClearHistory}
            className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1 hover:bg-neutral-800/50 py-1 px-2.5 rounded-lg transition-colors cursor-pointer"
            id="btn-clear-terminal-history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Log
          </button>
        )}
      </div>

      {/* Terminal Output Stream */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-3 bg-[#0A0A0A]/80">
        {/* Welcome Text */}
        <div className="text-neutral-500 border-b border-neutral-800/60 pb-3" id="terminal-welcome">
          <p className="text-neutral-300 font-semibold mb-1">ValKeyRe Command CLI Terminal [v2.6.0]</p>
          <p className="leading-relaxed">
            Enter standard Valkey or Redis commands (case-insensitive) below, or choose one of the quick macro cards.
            Examples: <span className="text-red-400">SET mykey "hello"</span>, <span className="text-red-400">GET mykey</span>, <span className="text-red-400">HGETALL user:101</span>.
          </p>
        </div>

        {/* History Stream */}
        {history.map((log) => (
          <div key={log.id} className="space-y-1.5 border-b border-neutral-900/40 pb-2.5" id={`log-item-${log.id}`}>
            {/* Prompt command line */}
            <div className="flex items-start gap-1 text-neutral-400">
              <span className="text-red-400 font-bold shrink-0">valkeyre&gt;</span>
              <span className="font-semibold text-neutral-100 select-all">{log.command}</span>
              <span className="text-[10px] text-neutral-600 ml-auto shrink-0 font-sans">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Command Result Output */}
            <div className={`pl-4 whitespace-pre-wrap leading-relaxed select-text ${
              log.status === 'error' ? 'text-red-400 font-semibold border-l-2 border-red-500 pl-3' : 'text-emerald-400'
            }`}>
              {log.result}
            </div>
          </div>
        ))}

        <div ref={terminalEndRef} />
      </div>

      {/* Macros / Snippets */}
      <div className="px-4 py-2.5 bg-[#121212] border-t border-neutral-900 flex items-center gap-1.5 shrink-0 overflow-x-auto select-none">
        <HelpCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <span className="text-[10px] text-neutral-500 shrink-0 font-medium font-sans mr-1">Quick Commands:</span>
        {commandSnippets.map((snip) => (
          <button
            key={snip.label}
            onClick={() => handleSnippetClick(snip.cmd)}
            className="bg-[#0D0D0D] hover:bg-neutral-800 border border-neutral-800/80 hover:border-neutral-700 px-2.5 py-1 rounded text-[10px] font-semibold text-neutral-300 transition-all font-mono cursor-pointer"
          >
            {snip.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="p-3 bg-[#121212] border-t border-neutral-900 flex gap-2 shrink-0 relative">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 font-bold font-mono text-xs select-none">
            valkeyre&gt;
          </span>
          <input
            type="text"
            className="w-full bg-[#0D0D0D] border border-neutral-800 rounded-lg pl-[88px] pr-4 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500/80 focus:bg-black shadow-inner"
            placeholder='Type command (e.g. GET key, LPUSH logs "msg")...'
            value={commandInput}
            onChange={(e) => {
              setCommandInput(e.target.value);
              setHideSuggestions(false);
              setSelectedSuggestionIndex(0);
            }}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            id="terminal-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />

          {/* Autocomplete Suggestions Box */}
          {visibleSuggestions.length > 0 && !hideSuggestions && (
            <div className="absolute bottom-full left-[88px] mb-2 w-64 bg-[#121212] border border-neutral-800 rounded-lg shadow-xl shadow-black/60 overflow-hidden z-50">
              <div className="px-2.5 py-1 bg-neutral-900 border-b border-neutral-800 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Command Suggestions
              </div>
              <ul className="max-h-48 overflow-y-auto py-1">
                {visibleSuggestions.map((cmd, idx) => (
                  <li key={cmd}>
                    <button
                      type="button"
                      onClick={() => applySuggestion(cmd)}
                      onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors flex items-center justify-between cursor-pointer ${
                        idx === selectedSuggestionIndex
                          ? 'bg-red-950/40 text-red-400 font-semibold'
                          : 'text-neutral-300 hover:bg-neutral-900/60'
                      }`}
                    >
                      <span>{cmd}</span>
                      {idx === selectedSuggestionIndex && (
                        <span className="text-[9px] bg-neutral-850 text-neutral-400 px-1 rounded uppercase font-sans font-medium">
                          Tab
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={!commandInput.trim() || isPending}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1 transition-all shadow cursor-pointer shrink-0"
          id="btn-submit-command"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
}
