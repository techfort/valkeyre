import { useState, useEffect, useRef } from 'react';
import {
  RedisKeyInfo,
  RedisConnectionConfig,
  ConnectionStatus,
  PubSubMessage,
  QueryLog,
  ServerStats,
  RedisType,
  MonitorLogEntry,
} from './types';
import ConnectionPanel from './components/ConnectionPanel';
import KeyListView from './components/KeyListView';
import KeyDetailView from './components/KeyDetailView';
import QueryConsole from './components/QueryConsole';
import PubSubPanel from './components/PubSubPanel';
import MonitorPanel from './components/MonitorPanel';
import ServerStatsPanel from './components/ServerStatsPanel';

import { Terminal, Database, Radio, RefreshCw, Layers, ShieldCheck, Github, ExternalLink, Activity } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'keys' | 'query' | 'pubsub' | 'monitor'>('keys');

  // Connection and system state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    mode: 'mock',
    host: 'Connecting...',
    port: 6379,
    db: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isStatsPending, setIsStatsPending] = useState(false);

  // Monitor logs state
  const [monitorLogs, setMonitorLogs] = useState<MonitorLogEntry[]>([]);

  // Redis Business States
  const [keys, setKeys] = useState<RedisKeyInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedKeyDetail, setSelectedKeyDetail] = useState<RedisKeyInfo | null>(null);

  // Search patterns cached to allow real-time triggered re-scans to use correct filters
  const [currentPattern, setCurrentPattern] = useState('*');
  const [currentTypeFilter, setCurrentTypeFilter] = useState('');

  // Pub/Sub Broker states
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);
  const [pubSubMessages, setPubSubMessages] = useState<PubSubMessage[]>([]);
  const [publishReceiverCount, setPublishReceiverCount] = useState<{ [channel: string]: number }>({});

  // Query editor states
  const [queryHistory, setQueryHistory] = useState<QueryLog[]>([]);
  const [isQueryPending, setIsQueryPending] = useState(false);

  // Metrics states
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [simulatorActive, setSimulatorActive] = useState(true);

  // WebSocket Ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set up real-time connection on mount
  useEffect(() => {
    connectWS();

    // Stats fetching loop every 6 seconds
    const statsTimer = setInterval(() => {
      fetchStats();
    }, 6000);

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(statsTimer);
    };
  }, []);

  // Helper to connect/reconnect WebSocket
  const connectWS = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Build standard or secure WS URL depending on page SSL context (Cloud Run friendly)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log(`Attempting WebSocket connection to: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket successfully opened');
      setIsLoading(false);

      // Trigger initial scan and stats fetch
      triggerScan(currentPattern, currentTypeFilter);
      fetchStats();

      // Resubscribe to channels if connection was lost and restored
      subscribedChannels.forEach((chan) => {
        sendWsMessage('pubsub-subscribe', { channel: chan });
      });
    };

    ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        switch (type) {
          case 'connection-status':
            setConnectionStatus(data);
            setIsLoading(false);

            if (data.connected && data.mode === 'real') {
              setMonitorLogs([]);
              setActiveTab('monitor');
            }

            // Refresh database layout upon switching connection
            if (data.connected) {
              triggerScan('*', '');
              fetchStats();
            }
            break;

          case 'connection-status-loading':
            setIsLoading(true);
            break;

          case 'scan-results':
            setKeys(data.keys || []);
            setIsScanning(false);
            break;

          case 'key-detail':
            if (data.error) {
              console.error('Key detail fetch error:', data.error);
            } else {
              setSelectedKeyDetail(data.detail);
            }
            break;

          case 'set-key-success':
            // Re-fetch key and scan list
            triggerScan(currentPattern, currentTypeFilter);
            if (selectedKey === data.key) {
              fetchKeyDetail(data.key);
            }
            break;

          case 'del-key-success':
            triggerScan(currentPattern, currentTypeFilter);
            if (selectedKey === data.key) {
              setSelectedKey(null);
              setSelectedKeyDetail(null);
            }
            break;

          case 'set-ttl-success':
            triggerScan(currentPattern, currentTypeFilter);
            if (selectedKey === data.key && selectedKeyDetail) {
              setSelectedKeyDetail({
                ...selectedKeyDetail,
                ttl: data.ttl,
              });
            }
            break;

          case 'pubsub-msg':
            setPubSubMessages((prev) => {
              const updated = [...prev, data];
              if (updated.length > 200) updated.shift(); // caps memory logs
              return updated;
            });
            break;

          case 'publish-response':
            setPublishReceiverCount((prev) => ({
              ...prev,
              [data.channel]: data.receiverCount,
            }));
            break;

          case 'query-result':
            setIsQueryPending(false);
            setQueryHistory((prev) => [
              ...prev,
              {
                id: Math.random().toString(36).substr(2, 9),
                command: data.command,
                timestamp: new Date().toISOString(),
                status: data.status,
                result: data.result,
              },
            ]);
            // Re-scan when modifying commands occur
            const upperCmd = data.command.trim().split(' ')[0].toUpperCase();
            const mutatingCmds = ['SET', 'DEL', 'LPUSH', 'RPUSH', 'SADD', 'HSET', 'ZADD', 'XADD', 'FLUSHALL', 'EXPIRE'];
            if (mutatingCmds.includes(upperCmd)) {
              triggerScan(currentPattern, currentTypeFilter);
            }
            break;

          case 'stats-results':
            setStats(data);
            setIsStatsPending(false);
            break;

          case 'simulator-status':
            setSimulatorActive(data.active);
            break;

          case 'realtime-key-event': {
            // REDIS KEYS ARE CHANGING LIVE! TRIGGER AUTO RE-SCAN!
            console.log('Real-time keyspace notification received:', data);
            triggerScan(currentPattern, currentTypeFilter);

            // If the updated key is our active detail viewer, reload details!
            if (selectedKey === data.key) {
              fetchKeyDetail(data.key);
            }

            // Add to real-time monitor log
            const newLog: MonitorLogEntry = {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              key: data.key,
              event: data.event || 'update',
              type: data.type || 'unknown',
              value: data.value,
            };

            setMonitorLogs((prev) => {
              // Cap at 200 logs to avoid unbounded growth
              return [newLog, ...prev].slice(0, 200);
            });
            break;
          }

          case 'error':
            alert(`Redis error response: ${data.message}`);
            setIsLoading(false);
            setIsScanning(false);
            setIsQueryPending(false);
            break;
        }
      } catch (err) {
        console.error('Error handling websocket message:', err);
      }
    };

    ws.onclose = () => {
      console.warn('WebSocket closed. Attempting auto-reconnect...');
      setConnectionStatus({
        connected: false,
        mode: 'mock',
        host: 'Reconnecting...',
        port: 6379,
        db: 0,
      });

      // Retry connecting every 4 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWS();
      }, 4000);
    };

    ws.onerror = (err) => {
      console.warn('WS stream error:', err);
      ws.close();
    };
  };

  // Helper to emit events to WS safely
  const sendWsMessage = (type: string, payload?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WS is closed. Buffering message or dropping:', type);
    }
  };

  // REDIS BUSINESS TRIGGER ACTIONS
  const handleConnect = (config: RedisConnectionConfig) => {
    sendWsMessage('connect', config);
  };

  const handleDisconnect = () => {
    sendWsMessage('disconnect');
  };

  const triggerScan = (pattern: string, typeFilter: string) => {
    setIsScanning(true);
    setCurrentPattern(pattern);
    setCurrentTypeFilter(typeFilter);
    sendWsMessage('scan', { pattern, typeFilter });
  };

  const fetchKeyDetail = (key: string) => {
    sendWsMessage('get-key-detail', { key });
  };

  const handleSelectKey = (key: string) => {
    setSelectedKey(key);
    fetchKeyDetail(key);
  };

  const handleDeleteKey = (key: string) => {
    sendWsMessage('del-key', { key });
  };

  const handleCreateKey = (key: string, type: RedisType, value: any, ttl?: number) => {
    sendWsMessage('set-key', { key, type, value, ttl });
  };

  const handleUpdateTTL = (key: string, ttl: number) => {
    sendWsMessage('set-ttl', { key, ttl });
  };

  const handleSaveString = (key: string, value: string) => {
    sendWsMessage('set-key', { key, type: 'string', value });
  };

  const handleUpdateCollection = (key: string, type: RedisType, updatedValue: any) => {
    sendWsMessage('set-key', { key, type, value: updatedValue });
  };

  const handleSubscribe = (channel: string) => {
    if (!subscribedChannels.includes(channel)) {
      setSubscribedChannels([...subscribedChannels, channel]);
      sendWsMessage('pubsub-subscribe', { channel });
    }
  };

  const handleUnsubscribe = (channel: string) => {
    setSubscribedChannels(subscribedChannels.filter((c) => c !== channel));
    sendWsMessage('pubsub-unsubscribe', { channel });
  };

  const handlePublish = (channel: string, message: string) => {
    sendWsMessage('pubsub-publish', { channel, message });
  };

  const handleRunQuery = (command: string) => {
    setIsQueryPending(true);
    sendWsMessage('run-query', { command });
  };

  const handleClearHistory = () => {
    setQueryHistory([]);
  };

  const handleInspectKey = (key: string) => {
    setActiveTab('keys');
    setSelectedKey(key);
    fetchKeyDetail(key);
  };

  const handleClearMonitorLogs = () => {
    setMonitorLogs([]);
  };

  const fetchStats = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsStatsPending(true);
      sendWsMessage('get-stats');
    }
  };

  const handleToggleSimulator = (active: boolean) => {
    sendWsMessage('simulator-toggle', { active });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-neutral-100 flex flex-col font-sans" id="app-root">
      
      {/* Visual Header / Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#121212]/90 border-b border-neutral-800 shadow-md shadow-black/20 shrink-0" id="app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-red-600 text-white p-2 rounded-xl shadow-md flex items-center justify-center">
              <Database className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 font-display">
                ValKeyRe
                <span className="text-[10px] font-semibold bg-red-950/40 text-red-400 px-1.5 py-0.2 rounded border border-red-900/40 uppercase tracking-widest font-sans">v2.6</span>
              </h1>
              <p className="text-[10px] text-neutral-400">Real-time Valkey &amp; Redis keyspace explorer</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button
              onClick={() => setActiveTab('keys')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'keys'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
              id="tab-keys"
            >
              <Layers className="w-3.5 h-3.5" />
              Keys Space
            </button>
            <button
              onClick={() => setActiveTab('query')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'query'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
              id="tab-query"
            >
              <Terminal className="w-3.5 h-3.5" />
              Query Terminal
            </button>
            <button
              onClick={() => setActiveTab('pubsub')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'pubsub'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
              id="tab-pubsub"
            >
              <Radio className="w-3.5 h-3.5" />
              Pub / Sub
            </button>
            <button
              onClick={() => setActiveTab('monitor')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'monitor'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
              id="tab-monitor"
            >
              <Activity className="w-3.5 h-3.5" />
              Real-time Monitor
            </button>
          </nav>

          {/* Github / Credits link */}
          <div className="hidden sm:flex items-center gap-2.5">
            <a
              href="https://github.com/techfort/valkeyre"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-red-400 transition-colors flex items-center gap-1 text-xs font-medium border border-neutral-800 hover:border-red-900/50 rounded-lg px-2.5 py-1.5 hover:bg-red-950/20"
            >
              <Github className="w-4 h-4 shrink-0" />
              <span>Original Repo</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 min-h-0">
        
        {/* Connection status section */}
        <section id="connection-section" className="shrink-0">
          <ConnectionPanel
            status={connectionStatus}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            simulatorActive={simulatorActive}
            onToggleSimulator={handleToggleSimulator}
            isLoading={isLoading}
          />
        </section>

        {/* Tab-driven Content Switcher */}
        <section id="tab-content-section" className="flex-1 min-h-[500px]">
          
          {/* TAB 1: KEYS EXPLORER */}
          {activeTab === 'keys' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full items-stretch" id="keys-explorer-tab-content">
              {/* Left sidebar: scanned keys */}
              <div className="lg:col-span-4 h-[600px] lg:h-[650px]">
                <KeyListView
                  keys={keys}
                  selectedKey={selectedKey}
                  onSelectKey={handleSelectKey}
                  onDeleteKey={handleDeleteKey}
                  onCreateKey={handleCreateKey}
                  onRefresh={() => triggerScan(currentPattern, currentTypeFilter)}
                  isScanning={isScanning}
                  onSearchChange={triggerScan}
                />
              </div>

              {/* Right panel: detail value editor */}
              <div className="lg:col-span-8 h-[600px] lg:h-[650px]">
                <KeyDetailView
                  keyInfo={selectedKeyDetail}
                  onSaveString={handleSaveString}
                  onUpdateTTL={handleUpdateTTL}
                  onDeleteKey={handleDeleteKey}
                  onUpdateCollection={handleUpdateCollection}
                />
              </div>
            </div>
          )}

          {/* TAB 2: QUERY CONSOLE */}
          {activeTab === 'query' && (
            <div className="h-[600px]" id="query-tab-content">
              <QueryConsole
                history={queryHistory}
                onRunQuery={handleRunQuery}
                onClearHistory={handleClearHistory}
                isPending={isQueryPending}
              />
            </div>
          )}

          {/* TAB 3: PUB/SUB BROKER */}
          {activeTab === 'pubsub' && (
            <div className="h-[600px]" id="pubsub-tab-content">
              <PubSubPanel
                messages={pubSubMessages}
                subscribedChannels={subscribedChannels}
                onSubscribe={handleSubscribe}
                onUnsubscribe={handleUnsubscribe}
                onPublish={handlePublish}
                publishReceiverCount={publishReceiverCount}
              />
            </div>
          )}

          {/* TAB 4: REAL-TIME MONITOR */}
          {activeTab === 'monitor' && (
            <div className="h-[600px]" id="monitor-tab-content">
              <MonitorPanel
                logs={monitorLogs}
                onClearLogs={handleClearMonitorLogs}
                onInspectKey={handleInspectKey}
              />
            </div>
          )}
        </section>

        {/* Diagnostic Metrics footer */}
        <section id="diagnostics-section" className="shrink-0">
          <ServerStatsPanel
            stats={stats}
            onRefreshStats={fetchStats}
            isPending={isStatsPending}
          />
        </section>

      </main>

      {/* Humble page footer */}
      <footer className="bg-[#121212] border-t border-neutral-800 py-4 shrink-0 text-center text-neutral-500 text-xs animate-fade-in" id="app-footer-bar">
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          Modernized ValKeyRe Server Dashboard with real-time Streams and Pub/Sub metrics (Valkey &amp; Redis).
        </p>
      </footer>
    </div>
  );
}
