export type RedisType = 'string' | 'list' | 'set' | 'zset' | 'hash' | 'stream';

export interface RedisKeyInfo {
  key: string;
  type: RedisType;
  ttl: number; // in seconds, -1 means no TTL, -2 means expired/not found
  size: number; // string length, list length, set size, hash size, stream length
  value: any; // Raw or formatted preview of the value
}

export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  useMock: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  mode: 'real' | 'mock';
  host: string;
  port: number;
  db: number;
}

export interface PubSubMessage {
  id: string;
  channel: string;
  message: string;
  timestamp: string;
}

export interface StreamEntry {
  id: string; // e.g. "1719642000000-0"
  fields: Record<string, string>;
}

export interface QueryLog {
  id: string;
  command: string;
  timestamp: string;
  status: 'success' | 'error';
  result: string;
}

export interface ServerStats {
  redis_version?: string;
  connected_clients?: string;
  used_memory_human?: string;
  uptime_in_seconds?: string;
  total_commands_processed?: string;
  instantaneous_ops_per_sec?: string;
  keys_count?: number;
}

export interface MonitorLogEntry {
  id: string;
  timestamp: string;
  key: string;
  event: string;
  type: RedisType | 'unknown';
  value: any;
}
