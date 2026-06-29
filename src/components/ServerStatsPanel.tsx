import { ServerStats } from '../types';
import { Activity, Cpu, ShieldCheck, Database, RefreshCw, Layers, Clock } from 'lucide-react';

interface ServerStatsPanelProps {
  stats: ServerStats | null;
  onRefreshStats: () => void;
  isPending: boolean;
}

export default function ServerStatsPanel({
  stats,
  onRefreshStats,
  isPending,
}: ServerStatsPanelProps) {

  const formatUptime = (secStr?: string) => {
    if (!secStr) return 'Unknown';
    const sec = parseInt(secStr, 10);
    if (isNaN(sec)) return secStr;

    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="bg-[#121212] border border-neutral-800 rounded-xl shadow-md p-5 flex flex-col gap-5" id="server-stats-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-red-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-white font-display">Server Diagnostics &amp; Metrics</h2>
        </div>
        <button
          onClick={onRefreshStats}
          disabled={isPending}
          className="p-1.5 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 hover:text-red-400 transition-colors flex items-center gap-1 text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
          id="btn-refresh-stats"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin text-red-500' : ''}`} />
          Fetch Stats
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Memory card */}
        <div className="p-4 bg-[#0A0A0A] border border-neutral-800/60 rounded-xl flex items-center gap-3">
          <div className="p-2.5 bg-neutral-900 text-neutral-300 rounded-lg shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Memory Allocation</p>
            <p className="text-base font-bold text-white font-mono mt-0.5 truncate">
              {stats?.used_memory_human || '1.24 MB'}
            </p>
          </div>
        </div>

        {/* Database size card */}
        <div className="p-4 bg-[#0A0A0A] border border-neutral-800/60 rounded-xl flex items-center gap-3">
          <div className="p-2.5 bg-neutral-900 text-neutral-300 rounded-lg shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Keys Count</p>
            <p className="text-base font-bold text-white font-mono mt-0.5 truncate">
              {stats?.keys_count !== undefined ? stats.keys_count : '---'}
            </p>
          </div>
        </div>

        {/* Connected Clients */}
        <div className="p-4 bg-[#0A0A0A] border border-neutral-800/60 rounded-xl flex items-center gap-3">
          <div className="p-2.5 bg-neutral-900 text-neutral-300 rounded-lg shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Clients Loaded</p>
            <p className="text-base font-bold text-white font-mono mt-0.5 truncate">
              {stats?.connected_clients || '1'}
            </p>
          </div>
        </div>

        {/* Uptime */}
        <div className="p-4 bg-[#0A0A0A] border border-neutral-800/60 rounded-xl flex items-center gap-3">
          <div className="p-2.5 bg-neutral-900 text-neutral-300 rounded-lg shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Server Uptime</p>
            <p className="text-xs font-bold text-white font-mono mt-1 truncate">
              {formatUptime(stats?.uptime_in_seconds)}
            </p>
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-neutral-800 pt-3.5 text-neutral-500 font-medium">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Valkey / Redis Engine Version: <span className="font-mono font-bold text-neutral-400">{stats?.redis_version || '2026.1_mock'}</span></span>
        </div>
        <div className="flex items-center gap-3">
          <span>Processed Ops: <span className="font-mono text-neutral-400">{stats?.total_commands_processed || '45'}</span></span>
          {stats?.instantaneous_ops_per_sec !== undefined && (
            <span>Rate: <span className="font-mono text-neutral-400">{stats.instantaneous_ops_per_sec} ops/sec</span></span>
          )}
        </div>
      </div>
    </div>
  );
}
