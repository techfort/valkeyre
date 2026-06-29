import { useState } from 'react';
import { ConnectionStatus, RedisConnectionConfig } from '../types';
import { Database, ShieldCheck, RefreshCw, Radio, Settings, AlertTriangle } from 'lucide-react';

interface ConnectionPanelProps {
  status: ConnectionStatus;
  onConnect: (config: RedisConnectionConfig) => void;
  simulatorActive: boolean;
  onToggleSimulator: (active: boolean) => void;
  isLoading: boolean;
}

export default function ConnectionPanel({
  status,
  onConnect,
  simulatorActive,
  onToggleSimulator,
  isLoading,
}: ConnectionPanelProps) {
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(6379);
  const [password, setPassword] = useState('');
  const [db, setDb] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleConnect = (useMock: boolean) => {
    onConnect({
      host,
      port,
      password: password || undefined,
      db,
      useMock,
    });
  };

  return (
    <div className="bg-[#121212] border border-neutral-800 rounded-xl shadow-md p-5 transition-all duration-200" id="connection-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-red-500" id="db-icon" />
          <h2 className="text-base font-semibold text-white font-display">Database Connection</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            status.connected
              ? status.mode === 'mock'
                ? 'bg-amber-950/40 text-amber-400 border-amber-900/50'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
              : 'bg-rose-950/40 text-rose-400 border-rose-900/50'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status.connected
                ? status.mode === 'mock' ? 'bg-amber-500' : 'bg-emerald-500'
                : 'bg-rose-500'
            } ${status.connected ? 'animate-pulse' : ''}`} />
            {status.connected
              ? status.mode === 'mock'
                ? 'Sandbox Mode'
                : `Connected DB ${status.db}`
              : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {status.error && !isLoading && (
        <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg flex items-start gap-2.5 text-xs text-red-400" id="conn-error-alert">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Connection Error:</span> {status.error}
            <div className="mt-1 text-[10px] text-red-500/80">
              Check if your Valkey or Redis container is running or try the Sandbox mode below.
            </div>
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
        <div className="md:col-span-5">
          <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Valkey / Redis Host</label>
          <input
            type="text"
            className="w-full text-sm px-3 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 focus:bg-black text-neutral-200 font-mono"
            placeholder="127.0.0.1"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={isLoading}
            id="input-host"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Port</label>
          <input
            type="number"
            className="w-full text-sm px-3 py-1.5 bg-[#0D0D0D] border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 focus:bg-black text-neutral-200 font-mono"
            placeholder="6379"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value, 10) || 6379)}
            disabled={isLoading}
            id="input-port"
          />
        </div>

        <div className="md:col-span-4 flex items-end">
          <button
            onClick={() => handleConnect(false)}
            disabled={isLoading}
            className="w-full bg-neutral-100 hover:bg-white text-black font-semibold py-1.5 px-4 rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            id="btn-real-connect"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Connect Real
          </button>
        </div>
      </div>

      {/* Advanced Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          id="btn-toggle-advanced"
        >
          <Settings className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
          {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings (Auth/DB)'}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-[#0D0D0D] border border-neutral-800 rounded-lg" id="advanced-settings-panel">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Password</label>
              <input
                type="password"
                className="w-full text-sm px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-200"
                placeholder="Optional password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                id="input-password"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">DB Index</label>
              <input
                type="number"
                min="0"
                max="15"
                className="w-full text-sm px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 text-neutral-200 font-mono"
                value={db}
                onChange={(e) => setDb(Math.max(0, parseInt(e.target.value, 10) || 0))}
                disabled={isLoading}
                id="input-db"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-800 my-4" />

      {/* Sandbox Connection & Activity Simulator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-950/20 border border-amber-900/30 rounded-lg p-3.5">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xs font-semibold text-amber-400">In-Memory Mock Sandbox</h3>
            <p className="text-[11px] text-amber-500/80 leading-relaxed mt-0.5">
              Connect to a client-independent local server sandbox loaded with keys, streams, lists, and values.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          {status.mode === 'mock' && status.connected && (
            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-850 rounded-md py-1 px-2 text-[11px]">
              <Radio className={`w-3.5 h-3.5 text-amber-500 ${simulatorActive ? 'animate-pulse text-red-500' : ''}`} />
              <span className="text-neutral-400 font-medium">Simulator:</span>
              <button
                onClick={() => onToggleSimulator(!simulatorActive)}
                className={`px-1.5 py-0.5 font-bold rounded text-[10px] uppercase transition-all cursor-pointer ${
                  simulatorActive
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-750'
                }`}
                id="btn-toggle-simulator"
              >
                {simulatorActive ? 'Active' : 'Paused'}
              </button>
            </div>
          )}

          <button
            onClick={() => handleConnect(true)}
            disabled={isLoading || (status.connected && status.mode === 'mock')}
            className={`text-xs font-semibold py-1.5 px-3 rounded-lg transition-all shadow-sm cursor-pointer ${
              status.connected && status.mode === 'mock'
                ? 'bg-neutral-800 text-neutral-500 border border-neutral-800/80 cursor-not-allowed shadow-none'
                : 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700'
            }`}
            id="btn-sandbox-connect"
          >
            Use Sandbox
          </button>
        </div>
      </div>
    </div>
  );
}
