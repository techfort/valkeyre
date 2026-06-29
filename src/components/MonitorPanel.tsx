import { useState, useEffect } from 'react';
import { MonitorLogEntry, RedisType } from '../types';
import { Activity, Trash2, Eye, Play, Pause, ChevronDown, ChevronUp, Database } from 'lucide-react';

interface MonitorPanelProps {
  logs: MonitorLogEntry[];
  onClearLogs: () => void;
  onInspectKey: (key: string) => void;
}

export default function MonitorPanel({ logs, onClearLogs, onInspectKey }: MonitorPanelProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [displayLogs, setDisplayLogs] = useState<MonitorLogEntry[]>([]);
  const [filterText, setFilterText] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Sync logs to display array when not paused
  useEffect(() => {
    if (!isPaused) {
      setDisplayLogs(logs);
    }
  }, [logs, isPaused]);

  // Apply filter
  const filteredLogs = displayLogs.filter((log) => {
    const text = filterText.toLowerCase();
    return (
      log.key.toLowerCase().includes(text) ||
      log.event.toLowerCase().includes(text) ||
      (log.type && log.type.toLowerCase().includes(text))
    );
  });

  // Color code actions
  const getEventBadgeStyles = (event: string) => {
    const ev = event.toLowerCase();
    if (ev.includes('set') || ev === 'string' || ev.includes('add')) {
      return 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40';
    }
    if (ev.includes('del') || ev.includes('rem') || ev === 'expired') {
      return 'bg-red-950/40 text-red-400 border border-red-900/40';
    }
    if (ev.includes('push') || ev.includes('pop') || ev.includes('insert') || ev.includes('update')) {
      return 'bg-amber-950/40 text-amber-400 border border-amber-900/40';
    }
    return 'bg-neutral-900 text-neutral-300 border border-neutral-800';
  };

  const getTypeStyles = (type: RedisType | 'unknown') => {
    switch (type) {
      case 'string':
        return 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30';
      case 'list':
        return 'bg-blue-950/30 text-blue-400 border border-blue-900/30';
      case 'set':
        return 'bg-purple-950/30 text-purple-400 border border-purple-900/30';
      case 'zset':
        return 'bg-pink-950/30 text-pink-400 border border-pink-900/30';
      case 'hash':
        return 'bg-amber-950/30 text-amber-400 border border-amber-900/30';
      case 'stream':
        return 'bg-cyan-950/30 text-cyan-400 border border-cyan-900/30';
      default:
        return 'bg-neutral-900 text-neutral-400 border border-neutral-850';
    }
  };

  const renderValuePreview = (log: MonitorLogEntry) => {
    if (log.value === null || log.value === undefined) {
      return <span className="text-neutral-600 italic">No value (deleted/expired)</span>;
    }

    try {
      if (typeof log.value === 'string') {
        return <span className="text-neutral-300 line-clamp-1 select-all">{log.value}</span>;
      }
      if (Array.isArray(log.value)) {
        if (log.type === 'zset') {
          const items = log.value.map((v: any) => `${v.value} (${v.score})`).join(', ');
          return <span className="text-neutral-400 line-clamp-1">{items}</span>;
        }
        if (log.type === 'stream') {
          const items = log.value.map((v: any) => `${v.id}: ${JSON.stringify(v.fields)}`).join(', ');
          return <span className="text-cyan-400 font-mono text-[10px] line-clamp-1">{items}</span>;
        }
        return <span className="text-neutral-400 line-clamp-1">[{log.value.join(', ')}]</span>;
      }
      if (typeof log.value === 'object') {
        return <span className="text-amber-400 font-mono text-[10px] line-clamp-1">{JSON.stringify(log.value)}</span>;
      }
      return <span className="text-neutral-300 line-clamp-1">{String(log.value)}</span>;
    } catch (e) {
      return <span className="text-neutral-500 italic">Unparseable value</span>;
    }
  };

  return (
    <div className="bg-[#0F0F0F] border border-neutral-800 rounded-xl shadow-md shadow-black/25 h-full flex flex-col overflow-hidden text-neutral-100" id="monitor-panel">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 bg-[#121212]/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 text-red-500 ${!isPaused ? 'animate-pulse' : ''}`} />
          <div>
            <h2 className="text-sm font-semibold font-display text-white">Keyspace Change Monitor</h2>
            <p className="text-[10px] text-neutral-500">Live transaction-like audit log of keyspace writes &amp; updates</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pause / Resume log streaming */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
              isPaused
                ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/50'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? 'Resume Monitoring' : 'Pause'}</span>
          </button>

          {/* Clear Log */}
          {logs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1.5 hover:bg-neutral-800/50 py-1.5 px-3 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-neutral-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div className="px-4 py-3 bg-[#111111] border-b border-neutral-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            className="w-full bg-[#070707] border border-neutral-850 rounded-lg px-3 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-red-500/50"
            placeholder="Filter logs by key, event type, or action..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
        <div className="text-[11px] text-neutral-500 font-medium">
          Total Captured Events: <span className="font-mono text-neutral-300 font-bold">{logs.length}</span>
          {isPaused && <span className="ml-1 text-amber-500 font-semibold">(PAUSED)</span>}
        </div>
      </div>

      {/* Logs Table / Stream */}
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A]/85 p-4 font-sans text-xs">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 select-none">
            <Activity className="w-10 h-10 text-neutral-800 mb-3" />
            <p className="text-neutral-500 font-medium text-sm">No activity events logged yet</p>
            <p className="text-neutral-600 text-xs mt-1 max-w-sm">
              {isPaused
                ? 'Monitoring is paused. Resume to listen for insertions and updates.'
                : 'Modify keys in the Keys Space, or run SET/LPUSH/HSET commands in the query terminal to see them trace in real-time here!'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  className={`border rounded-lg transition-all ${
                    isExpanded
                      ? 'bg-[#121212]/90 border-neutral-800 shadow-md shadow-black/40'
                      : 'bg-[#0D0D0D]/60 border-neutral-900 hover:border-neutral-800/80 hover:bg-[#0D0D0D]'
                  }`}
                >
                  {/* Summary row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 select-none">
                    {/* Timestamp */}
                    <div className="font-mono text-[10px] text-neutral-500 sm:w-20 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>

                    {/* Event action badge */}
                    <div className="sm:w-24 shrink-0">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-md font-mono uppercase tracking-wider font-semibold ${getEventBadgeStyles(log.event)}`}>
                        {log.event}
                      </span>
                    </div>

                    {/* Key Name badge */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Database className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="font-mono font-bold text-neutral-200 select-all truncate" title={log.key}>
                        {log.key}
                      </span>
                      {log.type && log.type !== 'unknown' && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase ${getTypeStyles(log.type)}`}>
                          {log.type}
                        </span>
                      )}
                    </div>

                    {/* Value quick preview */}
                    <div className="hidden md:block flex-1 min-w-0 text-neutral-400 font-mono truncate px-2 text-[11px]">
                      {renderValuePreview(log)}
                    </div>

                    {/* Expand/Collapse and actions */}
                    <div className="flex items-center gap-1.5 sm:ml-auto shrink-0 mt-2 sm:mt-0">
                      {log.value !== null && (
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors cursor-pointer"
                          title="Expand raw value log"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        onClick={() => onInspectKey(log.key)}
                        className="px-2.5 py-1 text-[10px] font-semibold text-red-400 border border-red-900/30 bg-red-950/20 hover:bg-red-950/40 hover:border-red-900/60 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                        title="Locate key in Keys Explorer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect Key</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail box */}
                  {isExpanded && log.value !== null && (
                    <div className="px-3 pb-3 pt-1 border-t border-neutral-900/80 bg-black/35 rounded-b-lg font-mono text-[11px] text-neutral-300">
                      <div className="mb-2 text-[10px] text-neutral-500 uppercase font-sans font-bold tracking-wider">
                        Key Value / Log Payload Snapshot
                      </div>
                      <pre className="p-3 bg-neutral-950 border border-neutral-900 rounded-lg max-h-60 overflow-y-auto whitespace-pre-wrap select-text selection:bg-red-950">
                        {typeof log.value === 'object'
                          ? JSON.stringify(log.value, null, 2)
                          : String(log.value)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
