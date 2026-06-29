import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import Redis from 'ioredis';
import { RedisKeyInfo, RedisType, PubSubMessage, StreamEntry, ServerStats } from './src/types';

// Parse raw text commands like GET key, HSET "my key" value
function parseCommand(cmdStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];
    if ((char === '"' || char === "'") && (i === 0 || cmdStr[i - 1] !== '\\')) {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    result.push(current);
  }
  return result;
}

// SIMULATED IN-MEMORY REDIS DATABASE FOR INSTANT WORKSPACE USE
interface MockKeyData {
  type: RedisType;
  ttl: number; // seconds, -1 for infinite
  createdAt: number;
  value: any;
}

class MockRedisEngine {
  private db: Map<string, MockKeyData> = new Map();
  private pubsubSubscribers: Map<string, Set<WebSocket>> = new Map();
  private backgroundInterval: NodeJS.Timeout | null = null;
  private wsServer: WebSocketServer | null = null;
  private shouldBroadcastToClient: ((ws: WebSocket) => boolean) | null = null;

  constructor() {
    this.resetToDefaults();
  }

  setWsServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  setBroadcastFilter(filter: (ws: WebSocket) => boolean) {
    this.shouldBroadcastToClient = filter;
  }

  resetToDefaults() {
    this.db.clear();
    const now = Date.now();

    // 1. Strings
    this.db.set('app:title', {
      type: 'string',
      ttl: -1,
      createdAt: now,
      value: 'ValKeyRe Sandbox',
    });
    this.db.set('app:version', {
      type: 'string',
      ttl: 3600, // 1 hour TTL
      createdAt: now,
      value: 'v2.6.0',
    });

    // 2. Hashes
    this.db.set('user:101', {
      type: 'hash',
      ttl: -1,
      createdAt: now,
      value: {
        id: '101',
        name: 'Alice Henderson',
        role: 'Database Administrator',
        status: 'active',
        last_active: new Date().toISOString(),
      },
    });
    this.db.set('user:102', {
      type: 'hash',
      ttl: 600, // 10 min TTL
      createdAt: now,
      value: {
        id: '102',
        name: 'Bob Chen',
        role: 'Developer',
        status: 'away',
        last_active: new Date(now - 300000).toISOString(),
      },
    });

    // 3. Lists
    this.db.set('queue:jobs', {
      type: 'list',
      ttl: -1,
      createdAt: now,
      value: [
        'job_id:9081 - Process bank statement exports',
        'job_id:9082 - Resize profile image avatars',
        'job_id:9083 - Bulk send monthly email digests',
        'job_id:9084 - Backup database snapshots to GCS',
      ],
    });

    // 4. Sets
    this.db.set('auth:roles', {
      type: 'set',
      ttl: -1,
      createdAt: now,
      value: ['super_admin', 'admin', 'editor', 'viewer', 'billing_admin'],
    });

    // 5. Sorted Sets (ZSets)
    this.db.set('leaderboard:scores', {
      type: 'zset',
      ttl: -1,
      createdAt: now,
      value: [
        { value: 'charlie_z', score: 1450 },
        { value: 'alice_db', score: 1200 },
        { value: 'bob_dev', score: 950 },
        { value: 'dan_ops', score: 820 },
      ],
    });

    // 6. Redis Streams
    this.db.set('stream:events', {
      type: 'stream',
      ttl: -1,
      createdAt: now,
      value: [
        {
          id: `${now - 60000}-0`,
          fields: { event: 'user_login', username: 'alice_db', ip: '192.168.1.10' },
        },
        {
          id: `${now - 30000}-0`,
          fields: { event: 'query_executed', command: 'KEYS *', duration_ms: '15' },
        },
        {
          id: `${now - 10000}-0`,
          fields: { event: 'stream_created', type: 'redis_streams', status: 'initialized' },
        },
      ],
    });
  }

  getKeys(pattern: string = '*', typeFilter?: string): RedisKeyInfo[] {
    const list: RedisKeyInfo[] = [];
    const now = Date.now();

    // Handle standard glob to simple regex
    const regexStr = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    let regex: RegExp;
    try {
      regex = new RegExp(regexStr);
    } catch {
      regex = /.*/;
    }

    for (const [key, data] of this.db.entries()) {
      // Check TTL expiry
      if (data.ttl > 0) {
        const elapsed = (now - data.createdAt) / 1000;
        if (elapsed >= data.ttl) {
          this.db.delete(key);
          this.broadcastKeyEvent('expired', key);
          continue;
        }
      }

      // Filter by pattern
      if (!regex.test(key)) continue;

      // Filter by type
      if (typeFilter && data.type !== typeFilter) continue;

      let size = 0;
      if (data.type === 'string') size = String(data.value).length;
      else if (data.type === 'list') size = data.value.length;
      else if (data.type === 'set') size = data.value.length;
      else if (data.type === 'zset') size = data.value.length;
      else if (data.type === 'hash') size = Object.keys(data.value).length;
      else if (data.type === 'stream') size = data.value.length;

      let calculatedTtl = -1;
      if (data.ttl > 0) {
        calculatedTtl = Math.max(0, Math.ceil(data.ttl - (now - data.createdAt) / 1000));
      }

      list.push({
        key,
        type: data.type,
        ttl: calculatedTtl,
        size,
        value: data.value,
      });
    }

    return list;
  }

  getKey(key: string): RedisKeyInfo | null {
    const now = Date.now();
    const data = this.db.get(key);
    if (!data) return null;

    if (data.ttl > 0) {
      const elapsed = (now - data.createdAt) / 1000;
      if (elapsed >= data.ttl) {
        this.db.delete(key);
        this.broadcastKeyEvent('expired', key);
        return null;
      }
    }

    let size = 0;
    if (data.type === 'string') size = String(data.value).length;
    else if (data.type === 'list') size = data.value.length;
    else if (data.type === 'set') size = data.value.length;
    else if (data.type === 'zset') size = data.value.length;
    else if (data.type === 'hash') size = Object.keys(data.value).length;
    else if (data.type === 'stream') size = data.value.length;

    let calculatedTtl = -1;
    if (data.ttl > 0) {
      calculatedTtl = Math.max(0, Math.ceil(data.ttl - (now - data.createdAt) / 1000));
    }

    return {
      key,
      type: data.type,
      ttl: calculatedTtl,
      size,
      value: data.value,
    };
  }

  setKey(key: string, type: RedisType, value: any, ttl: number = -1) {
    this.db.set(key, {
      type,
      ttl,
      createdAt: Date.now(),
      value,
    });
    this.broadcastKeyEvent('set', key);
  }

  delKey(key: string): boolean {
    const deleted = this.db.delete(key);
    if (deleted) {
      this.broadcastKeyEvent('del', key);
    }
    return deleted;
  }

  setTtl(key: string, ttl: number): boolean {
    const data = this.db.get(key);
    if (!data) return false;
    data.ttl = ttl;
    data.createdAt = Date.now();
    this.broadcastKeyEvent('expire', key);
    return true;
  }

  // PubSub management
  subscribe(ws: WebSocket, channel: string) {
    if (!this.pubsubSubscribers.has(channel)) {
      this.pubsubSubscribers.set(channel, new Set());
    }
    this.pubsubSubscribers.get(channel)!.add(ws);
  }

  unsubscribe(ws: WebSocket, channel: string) {
    const subs = this.pubsubSubscribers.get(channel);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.pubsubSubscribers.delete(channel);
      }
    }
  }

  unsubscribeAll(ws: WebSocket) {
    for (const [channel, subs] of this.pubsubSubscribers.entries()) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.pubsubSubscribers.delete(channel);
      }
    }
  }

  publish(channel: string, message: string): number {
    const subs = this.pubsubSubscribers.get(channel);
    const count = subs ? subs.size : 0;

    const payload: PubSubMessage = {
      id: Math.random().toString(36).substr(2, 9),
      channel,
      message,
      timestamp: new Date().toISOString(),
    };

    if (subs) {
      for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pubsub-msg', data: payload }));
        }
      }
    }

    // Also broadcast to any glob listening channel subscribers if desired, but direct channel is enough for mock
    return count;
  }

  // Real-time Event broadcast
  private broadcastKeyEvent(event: string, key: string) {
    if (!this.wsServer) return;
    const dbItem = this.db.get(key);
    const payload = JSON.stringify({
      type: 'realtime-key-event',
      data: {
        event,
        key,
        type: dbItem?.type || 'unknown',
        value: dbItem ? dbItem.value : null,
      },
    });

    for (const client of this.wsServer.clients) {
      if (this.shouldBroadcastToClient && !this.shouldBroadcastToClient(client as WebSocket)) {
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Background activity simulator to make Sandbox highly interactive
  startSimulator() {
    if (this.backgroundInterval) return;

    this.backgroundInterval = setInterval(() => {
      const actions = ['stream-append', 'score-change', 'log-append', 'ttl-expire', 'hash-update'];
      const action = actions[Math.floor(Math.random() * actions.length)];

      const now = Date.now();

      try {
        if (action === 'stream-append') {
          const streamData = this.db.get('stream:events');
          if (streamData && streamData.type === 'stream') {
            const types = ['user_click', 'api_request', 'cache_hit', 'order_created'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const newEntry = {
              id: `${now}-0`,
              fields: {
                event: randomType,
                timestamp: new Date().toISOString(),
                server_id: `srv-${Math.floor(Math.random() * 900) + 100}`,
              },
            };
            streamData.value.push(newEntry);
            if (streamData.value.length > 50) streamData.value.shift(); // keep capping it
            this.broadcastKeyEvent('stream-add', 'stream:events');
          }
        } else if (action === 'score-change') {
          const zsetData = this.db.get('leaderboard:scores');
          if (zsetData && zsetData.type === 'zset') {
            const index = Math.floor(Math.random() * zsetData.value.length);
            const scoreDiff = Math.floor(Math.random() * 100) - 40; // -40 to +60
            zsetData.value[index].score = Math.max(100, zsetData.value[index].score + scoreDiff);
            // sort descending
            zsetData.value.sort((a: any, b: any) => b.score - a.score);
            this.broadcastKeyEvent('set', 'leaderboard:scores');
          }
        } else if (action === 'log-append') {
          const listData = this.db.get('queue:jobs');
          if (listData && listData.type === 'list') {
            const tasks = [
              'job_id:9085 - Generate PDF invoice reports',
              'job_id:9086 - Clear stale browser cache sessions',
              'job_id:9087 - Ping external payment gateway',
              'job_id:9088 - Refresh feed recommendation graphs',
            ];
            const newTask = tasks[Math.floor(Math.random() * tasks.length)];
            listData.value.push(newTask);
            if (listData.value.length > 20) listData.value.shift();
            this.broadcastKeyEvent('list-push', 'queue:jobs');
          }
        } else if (action === 'hash-update') {
          const hashData = this.db.get('user:101');
          if (hashData && hashData.type === 'hash') {
            hashData.value.last_active = new Date().toISOString();
            this.broadcastKeyEvent('set', 'user:101');
          }
        }

        // Randomly publish to a channel
        const channels = ['alerts:system', 'chat:general', 'analytics:clicks'];
        const channel = channels[Math.floor(Math.random() * channels.length)];
        const msgs = [
          'System health normal: CPU 12%, MEM 44%',
          'User connected to channel chat:general',
          'Redis is extremely fast!',
          'New analytical hit captured in database',
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        this.publish(channel, msg);
      } catch (e) {
        console.error('Simulator error:', e);
      }
    }, 4000);
  }

  stopSimulator() {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }
  }

  executeCommand(commandLine: string): string {
    const args = parseCommand(commandLine);
    if (args.length === 0) return 'Error: Empty command';

    const cmd = args[0].toUpperCase();

    switch (cmd) {
      case 'PING':
        return 'PONG';
      case 'SET': {
        if (args.length < 3) return 'ERR wrong number of arguments for SET command';
        const key = args[1];
        const val = args.slice(2).join(' ');
        this.setKey(key, 'string', val);
        return 'OK';
      }
      case 'GET': {
        if (args.length < 2) return 'ERR wrong number of arguments for GET command';
        const info = this.getKey(args[1]);
        if (!info) return '(nil)';
        if (info.type !== 'string') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
        return String(info.value);
      }
      case 'DEL': {
        if (args.length < 2) return 'ERR wrong number of arguments for DEL command';
        let count = 0;
        for (let i = 1; i < args.length; i++) {
          if (this.delKey(args[i])) count++;
        }
        return `(integer) ${count}`;
      }
      case 'EXISTS': {
        if (args.length < 2) return 'ERR wrong number of arguments for EXISTS command';
        let count = 0;
        for (let i = 1; i < args.length; i++) {
          if (this.getKey(args[i])) count++;
        }
        return `(integer) ${count}`;
      }
      case 'EXPIRE': {
        if (args.length < 3) return 'ERR wrong number of arguments for EXPIRE command';
        const key = args[1];
        const seconds = parseInt(args[2], 10);
        if (isNaN(seconds)) return 'ERR value is not an integer or out of range';
        const success = this.setTtl(key, seconds);
        return success ? '(integer) 1' : '(integer) 0';
      }
      case 'TTL': {
        if (args.length < 2) return 'ERR wrong number of arguments for TTL command';
        const info = this.getKey(args[1]);
        if (!info) return '(integer) -2';
        return `(integer) ${info.ttl}`;
      }
      case 'LPUSH': {
        if (args.length < 3) return 'ERR wrong number of arguments for LPUSH command';
        const key = args[1];
        const vals = args.slice(2);
        const info = this.getKey(key);
        let list: string[] = [];

        if (info) {
          if (info.type !== 'list') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          list = info.value;
        }

        list.unshift(...vals);
        this.setKey(key, 'list', list);
        return `(integer) ${list.length}`;
      }
      case 'RPUSH': {
        if (args.length < 3) return 'ERR wrong number of arguments for RPUSH command';
        const key = args[1];
        const vals = args.slice(2);
        const info = this.getKey(key);
        let list: string[] = [];

        if (info) {
          if (info.type !== 'list') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          list = info.value;
        }

        list.push(...vals);
        this.setKey(key, 'list', list);
        return `(integer) ${list.length}`;
      }
      case 'LRANGE': {
        if (args.length < 4) return 'ERR wrong number of arguments for LRANGE command';
        const key = args[1];
        const start = parseInt(args[2], 10);
        const stop = parseInt(args[3], 10);

        const info = this.getKey(key);
        if (!info) return '(empty list or set)';
        if (info.type !== 'list') return 'WRONGTYPE Operation against a key holding the wrong kind of value';

        const list = info.value;
        const len = list.length;
        let s = start < 0 ? len + start : start;
        let e = stop < 0 ? len + stop : stop;
        s = Math.max(0, s);
        e = Math.min(len - 1, e);

        if (s > e || s >= len) return '(empty list or set)';

        return list.slice(s, e + 1).map((item: string, idx: number) => `${idx + 1}) "${item}"`).join('\n');
      }
      case 'SADD': {
        if (args.length < 3) return 'ERR wrong number of arguments for SADD command';
        const key = args[1];
        const vals = args.slice(2);
        const info = this.getKey(key);
        let set: string[] = [];

        if (info) {
          if (info.type !== 'set') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          set = info.value;
        }

        let added = 0;
        for (const val of vals) {
          if (!set.includes(val)) {
            set.push(val);
            added++;
          }
        }
        this.setKey(key, 'set', set);
        return `(integer) ${added}`;
      }
      case 'SMEMBERS': {
        if (args.length < 2) return 'ERR wrong number of arguments for SMEMBERS command';
        const info = this.getKey(args[1]);
        if (!info) return '(empty list or set)';
        if (info.type !== 'set') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
        return info.value.map((item: string, idx: number) => `${idx + 1}) "${item}"`).join('\n');
      }
      case 'HSET': {
        if (args.length < 4 || args.length % 2 !== 0) return 'ERR wrong number of arguments for HSET command';
        const key = args[1];
        const info = this.getKey(key);
        let hash: Record<string, string> = {};

        if (info) {
          if (info.type !== 'hash') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          hash = info.value;
        }

        let createdCount = 0;
        for (let i = 2; i < args.length; i += 2) {
          const field = args[i];
          const val = args[i + 1];
          if (!(field in hash)) createdCount++;
          hash[field] = val;
        }

        this.setKey(key, 'hash', hash);
        return `(integer) ${createdCount}`;
      }
      case 'HGET': {
        if (args.length < 3) return 'ERR wrong number of arguments for HGET command';
        const key = args[1];
        const field = args[2];
        const info = this.getKey(key);
        if (!info) return '(nil)';
        if (info.type !== 'hash') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
        return field in info.value ? String(info.value[field]) : '(nil)';
      }
      case 'HGETALL': {
        if (args.length < 2) return 'ERR wrong number of arguments for HGETALL command';
        const info = this.getKey(args[1]);
        if (!info) return '(empty list or set)';
        if (info.type !== 'hash') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
        const resultLines: string[] = [];
        let index = 1;
        for (const [f, v] of Object.entries(info.value)) {
          resultLines.push(`${index++}) "${f}"`);
          resultLines.push(`${index++}) "${v}"`);
        }
        return resultLines.join('\n');
      }
      case 'ZADD': {
        if (args.length < 4 || (args.length - 2) % 2 !== 0) return 'ERR wrong number of arguments for ZADD command';
        const key = args[1];
        const info = this.getKey(key);
        let zset: { value: string; score: number }[] = [];

        if (info) {
          if (info.type !== 'zset') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          zset = info.value;
        }

        let added = 0;
        for (let i = 2; i < args.length; i += 2) {
          const score = parseFloat(args[i]);
          const val = args[i + 1];
          if (isNaN(score)) return 'ERR value is not a valid float';

          const existingIndex = zset.findIndex((item) => item.value === val);
          if (existingIndex !== -1) {
            zset[existingIndex].score = score;
          } else {
            zset.push({ value: val, score });
            added++;
          }
        }

        zset.sort((a, b) => a.score - b.score);
        this.setKey(key, 'zset', zset);
        return `(integer) ${added}`;
      }
      case 'ZRANGE': {
        if (args.length < 4) return 'ERR wrong number of arguments for ZRANGE command';
        const key = args[1];
        const start = parseInt(args[2], 10);
        const stop = parseInt(args[3], 10);
        const withScores = args.length > 4 && args[4].toUpperCase() === 'WITHSCORES';

        const info = this.getKey(key);
        if (!info) return '(empty list or set)';
        if (info.type !== 'zset') return 'WRONGTYPE Operation against a key holding the wrong kind of value';

        const zset = info.value;
        const len = zset.length;
        let s = start < 0 ? len + start : start;
        let e = stop < 0 ? len + stop : stop;
        s = Math.max(0, s);
        e = Math.min(len - 1, e);

        if (s > e || s >= len) return '(empty list or set)';

        const range = zset.slice(s, e + 1);
        const resultLines: string[] = [];
        let index = 1;
        for (const item of range) {
          resultLines.push(`${index++}) "${item.value}"`);
          if (withScores) {
            resultLines.push(`${index++}) "${item.score}"`);
          }
        }
        return resultLines.join('\n');
      }
      case 'XADD': {
        if (args.length < 5 || args.length % 2 === 0) return 'ERR wrong number of arguments for XADD command';
        const key = args[1];
        let id = args[2];
        if (id === '*') {
          id = `${Date.now()}-0`;
        }

        const info = this.getKey(key);
        let stream: { id: string; fields: Record<string, string> }[] = [];

        if (info) {
          if (info.type !== 'stream') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
          stream = info.value;
        }

        const fields: Record<string, string> = {};
        for (let i = 3; i < args.length; i += 2) {
          fields[args[i]] = args[i + 1];
        }

        stream.push({ id, fields });
        this.setKey(key, 'stream', stream);
        return `"${id}"`;
      }
      case 'XLEN': {
        if (args.length < 2) return 'ERR wrong number of arguments for XLEN command';
        const info = this.getKey(args[1]);
        if (!info) return '(integer) 0';
        if (info.type !== 'stream') return 'WRONGTYPE Operation against a key holding the wrong kind of value';
        return `(integer) ${info.value.length}`;
      }
      case 'XRANGE': {
        if (args.length < 4) return 'ERR wrong number of arguments for XRANGE command';
        const key = args[1];
        const start = args[2];
        const end = args[3];

        const info = this.getKey(key);
        if (!info) return '(empty list or set)';
        if (info.type !== 'stream') return 'WRONGTYPE Operation against a key holding the wrong kind of value';

        const stream = info.value;
        let filtered = stream;
        if (start !== '-') {
          filtered = filtered.filter((e: any) => e.id >= start);
        }
        if (end !== '+') {
          filtered = filtered.filter((e: any) => e.id <= end);
        }

        const lines: string[] = [];
        let index = 1;
        for (const entry of filtered) {
          lines.push(`${index++}) "${entry.id}"`);
          const fieldsStr = Object.entries(entry.fields)
            .flatMap(([k, v]) => [`"${k}"`, `"${v}"`])
            .map((s, i) => `   ${i + 1}) ${s}`)
            .join('\n');
          lines.push(fieldsStr);
        }

        return lines.join('\n') || '(empty list or set)';
      }
      case 'PUBLISH': {
        if (args.length < 3) return 'ERR wrong number of arguments for PUBLISH command';
        const chan = args[1];
        const msg = args.slice(2).join(' ');
        const subCount = this.publish(chan, msg);
        return `(integer) ${subCount}`;
      }
      case 'FLUSHALL': {
        this.db.clear();
        this.broadcastKeyEvent('flush', '*');
        return 'OK';
      }
      case 'DBSIZE': {
        return `(integer) ${this.db.size}`;
      }
      case 'KEYS': {
        if (args.length < 2) return 'ERR wrong number of arguments for KEYS command';
        const keysList = this.getKeys(args[1]);
        if (keysList.length === 0) return '(empty list or set)';
        return keysList.map((k, i) => `${i + 1}) "${k.key}"`).join('\n');
      }
      case 'INFO': {
        return `# Server\nredis_version:2026.1.0_mock\nuptime_in_seconds:${Math.floor(process.uptime())}\n\n# Clients\nconnected_clients:${this.wsServer?.clients.size || 1}\n\n# Memory\nused_memory_human:1.24M\n\n# Keyspace\ndb0:keys=${this.db.size},expires=${Array.from(this.db.values()).filter((v) => v.ttl > 0).length}`;
      }
      default:
        return `ERR unknown command '${cmd}' or incorrect arguments`;
    }
  }
}

// Global server application bootstrap
async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);

  // Set up WebSocket server on the same HTTP server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // Instantiate the mock engine
  const mockEngine = new MockRedisEngine();
  mockEngine.setWsServer(wss);

  // Track active real Redis connections per WebSocket client, as well as subscriber clients
  const activeClients = new Map<
    WebSocket,
    {
      redis: Redis | null;
      sub: Redis | null;
      config: { host: string; port: number; password?: string; db: number };
    }
  >();

  // Prevent mock keyspace events from leaking into real Redis sessions.
  mockEngine.setBroadcastFilter((client) => {
    const state = activeClients.get(client);
    return !(state && state.redis);
  });

  mockEngine.startSimulator(); // active by default for high visual engagement

  // Helper to send message to a socket safely
  const sendToSocket = (ws: WebSocket, type: string, data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  };

  wss.on('connection', (ws) => {
    console.log('Client connected to real-time RedisVue WebSocket');

    // Default connection status is mock sandbox mode
    sendToSocket(ws, 'connection-status', {
      connected: true,
      mode: 'mock',
      host: 'in-memory-sandbox',
      port: 6379,
      db: 0,
    });

    ws.on('message', async (messageBuffer) => {
      try {
        const rawMsg = messageBuffer.toString();
        const { type, payload } = JSON.parse(rawMsg);

        const clientState = activeClients.get(ws);
        const isMock = !clientState || !clientState.redis;

        switch (type) {
          case 'connect': {
            const { host, port, password, db, useMock } = payload;

            // Cleanup old connection if any
            if (clientState) {
              if (clientState.redis) clientState.redis.disconnect();
              if (clientState.sub) clientState.sub.disconnect();
              activeClients.delete(ws);
            }

            if (useMock) {
              sendToSocket(ws, 'connection-status', {
                connected: true,
                mode: 'mock',
                host: 'in-memory-sandbox',
                port: 6379,
                db: 0,
              });
              return;
            }

            // Establish real Redis client
            try {
              sendToSocket(ws, 'connection-status-loading', { message: 'Connecting to Valkey / Redis...' });

              const redisClient = new Redis({
                host: host || 'localhost',
                port: port || 6379,
                password: password || undefined,
                db: db || 0,
                connectTimeout: 4000,
                maxRetriesPerRequest: 1,
              });

              // Create a secondary client for subscriber actions (Keyspace notifications + PubSub)
              const subClient = new Redis({
                host: host || 'localhost',
                port: port || 6379,
                password: password || undefined,
                db: db || 0,
                connectTimeout: 4000,
                maxRetriesPerRequest: 1,
              });

              await new Promise<void>((resolve, reject) => {
                let resolved = false;
                redisClient.once('ready', () => {
                  resolved = true;
                  resolve();
                });
                redisClient.once('error', (err) => {
                  if (!resolved) {
                    redisClient.disconnect();
                    subClient.disconnect();
                    reject(err);
                  }
                });
              });

              // Try to configure keyspace notifications on the real Redis if possible
              try {
                await redisClient.config('SET', 'notify-keyspace-events', 'KEA');
                console.log('Real-time keyspace notifications configured successfully');
              } catch (confErr) {
                console.warn('Could not set keyspace notifications config. Redis may be in read-only or restricted mode:', confErr);
              }

              // Listen to keyspace events
              subClient.psubscribe('__keyevent@' + (db || 0) + '__:*', (err) => {
                if (err) {
                  console.error('Failed to subscribe to keyspace notifications:', err);
                } else {
                  console.log(`Subscribed to real-time keyspace events for DB ${db || 0}`);
                }
              });

              subClient.on('pmessage', async (pattern, channel, message) => {
                // message is the key, channel is "__keyevent@0__:set", etc.
                const match = channel.match(/__keyevent@\d+__:(.+)/);
                const event = match ? match[1] : 'unknown';

                let keyType: string = 'unknown';
                let value: any = null;

                try {
                  const redis = clientState?.redis || redisClient;
                  if (redis) {
                    keyType = (await redis.type(message)) || 'unknown';
                    if (keyType === 'string') {
                      value = await redis.get(message);
                    } else if (keyType === 'list') {
                      value = await redis.lrange(message, 0, 5);
                    } else if (keyType === 'set') {
                      value = await redis.smembers(message);
                    } else if (keyType === 'zset') {
                      const zrange = await redis.zrange(message, 0, 5, 'WITHSCORES');
                      const parsed = [];
                      for (let i = 0; i < zrange.length; i += 2) {
                        parsed.push({ value: zrange[i], score: parseFloat(zrange[i + 1] || '0') });
                      }
                      value = parsed;
                    } else if (keyType === 'hash') {
                      value = await redis.hgetall(message);
                    } else if (keyType === 'stream') {
                      const rawEntries = await redis.xrange(message, '-', '+', 'COUNT', 5);
                      value = rawEntries.map((item) => {
                        const id = item[0];
                        const fieldsArr = item[1];
                        const fields: Record<string, string> = {};
                        for (let i = 0; i < fieldsArr.length; i += 2) {
                          fields[fieldsArr[i]] = fieldsArr[i + 1];
                        }
                        return { id, fields };
                      });
                    }
                  }
                } catch (err) {
                  // Ignore and send partial info
                }

                sendToSocket(ws, 'realtime-key-event', {
                  event,
                  key: message,
                  type: keyType,
                  value,
                });
              });

              activeClients.set(ws, {
                redis: redisClient,
                sub: subClient,
                config: { host, port, password, db },
              });

              sendToSocket(ws, 'connection-status', {
                connected: true,
                mode: 'real',
                host,
                port,
                db,
              });
            } catch (err: any) {
              console.warn('Redis connection failed:', err.message || err);
              sendToSocket(ws, 'connection-status', {
                connected: false,
                mode: 'real',
                host,
                port,
                db,
                error: err.message || 'Connection refused or timed out',
              });
            }
            break;
          }

          case 'scan': {
            const { pattern = '*', typeFilter = '' } = payload || {};

            if (isMock) {
              const keys = mockEngine.getKeys(pattern, typeFilter);
              sendToSocket(ws, 'scan-results', { keys });
            } else {
              const redis = clientState!.redis!;
              try {
                // Use ioredis SCAN to find keys
                let cursor = '0';
                let keys: string[] = [];
                // Simple single page SCAN up to 1000 keys for performance
                const [nextCursor, scannedKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
                keys = scannedKeys;

                const resultInfos: RedisKeyInfo[] = [];

                for (const key of keys) {
                  try {
                    const keyType = (await redis.type(key)) as RedisType;
                    if (typeFilter && keyType !== typeFilter) continue;

                    const ttl = await redis.ttl(key);
                    let size = 0;

                    // Fetch length/size in O(1) or cheap commands
                    if (keyType === 'string') {
                      size = await redis.strlen(key);
                    } else if (keyType === 'list') {
                      size = await redis.llen(key);
                    } else if (keyType === 'set') {
                      size = await redis.scard(key);
                    } else if (keyType === 'zset') {
                      size = await redis.zcard(key);
                    } else if (keyType === 'hash') {
                      size = await redis.hlen(key);
                    } else if (keyType === 'stream') {
                      size = await redis.xlen(key);
                    }

                    resultInfos.push({
                      key,
                      type: keyType,
                      ttl,
                      size,
                      value: null, // load detailed values separately on demand
                    });
                  } catch {
                    // key might have expired in between scan and type
                  }
                }

                sendToSocket(ws, 'scan-results', { keys: resultInfos });
              } catch (scanErr: any) {
                console.error('Scan error:', scanErr);
                sendToSocket(ws, 'error', { message: 'SCAN command failed: ' + scanErr.message });
              }
            }
            break;
          }

          case 'get-key-detail': {
            const { key } = payload;
            if (isMock) {
              const detail = mockEngine.getKey(key);
              sendToSocket(ws, 'key-detail', { key, detail });
            } else {
              const redis = clientState!.redis!;
              try {
                const keyType = (await redis.type(key)) as RedisType;
                const ttl = await redis.ttl(key);
                let value: any = null;
                let size = 0;

                if (keyType === 'string') {
                  value = await redis.get(key);
                  size = value ? value.length : 0;
                } else if (keyType === 'list') {
                  value = await redis.lrange(key, 0, 99); // show first 100
                  size = await redis.llen(key);
                } else if (keyType === 'set') {
                  value = await redis.smembers(key);
                  size = value.length;
                } else if (keyType === 'zset') {
                  const zrange = await redis.zrange(key, 0, 99, 'WITHSCORES');
                  // ioredis zrange returns flat array [val1, score1, val2, score2...] when WITHSCORES is passed
                  const parsedZset = [];
                  for (let i = 0; i < zrange.length; i += 2) {
                    parsedZset.push({
                      value: zrange[i],
                      score: parseFloat(zrange[i + 1]),
                    });
                  }
                  value = parsedZset;
                  size = await redis.zcard(key);
                } else if (keyType === 'hash') {
                  value = await redis.hgetall(key);
                  size = Object.keys(value).length;
                } else if (keyType === 'stream') {
                  // XRANGE key - + COUNT 100
                  const rawEntries = await redis.xrange(key, '-', '+', 'COUNT', 100);
                  // ioredis xrange returns: [ [ '1719642000000-0', [ 'field1', 'val1', 'field2', 'val2' ] ], ... ]
                  const entries: StreamEntry[] = rawEntries.map((item) => {
                    const id = item[0];
                    const fieldsArr = item[1];
                    const fields: Record<string, string> = {};
                    for (let i = 0; i < fieldsArr.length; i += 2) {
                      fields[fieldsArr[i]] = fieldsArr[i + 1];
                    }
                    return { id, fields };
                  });
                  value = entries;
                  size = await redis.xlen(key);
                }

                sendToSocket(ws, 'key-detail', {
                  key,
                  detail: {
                    key,
                    type: keyType,
                    ttl,
                    size,
                    value,
                  },
                });
              } catch (detailErr: any) {
                sendToSocket(ws, 'key-detail', { key, error: detailErr.message });
              }
            }
            break;
          }

          case 'set-key': {
            const { key, type: keyType, value, ttl } = payload;
            if (isMock) {
              mockEngine.setKey(key, keyType, value, ttl);
              sendToSocket(ws, 'set-key-success', { key });
            } else {
              const redis = clientState!.redis!;
              try {
                if (keyType === 'string') {
                  if (ttl && ttl > 0) {
                    await redis.set(key, value, 'EX', ttl);
                  } else {
                    await redis.set(key, value);
                  }
                } else if (keyType === 'hash') {
                  const fields = value; // assuming object Record<string, string>
                  await redis.hset(key, fields);
                  if (ttl && ttl > 0) await redis.expire(key, ttl);
                } else if (keyType === 'list') {
                  // value is array
                  await redis.del(key);
                  if (value.length > 0) {
                    await redis.rpush(key, ...value);
                  }
                  if (ttl && ttl > 0) await redis.expire(key, ttl);
                } else if (keyType === 'set') {
                  await redis.del(key);
                  if (value.length > 0) {
                    await redis.sadd(key, ...value);
                  }
                  if (ttl && ttl > 0) await redis.expire(key, ttl);
                } else if (keyType === 'zset') {
                  await redis.del(key);
                  // value is array of { value, score }
                  for (const entry of value) {
                    await redis.zadd(key, entry.score, entry.value);
                  }
                  if (ttl && ttl > 0) await redis.expire(key, ttl);
                } else if (keyType === 'stream') {
                  // Stream add entry { id, fields }
                  const { id = '*', fields } = value;
                  const flatFields = Object.entries(fields).flat() as string[];
                  await redis.xadd(key, id, ...flatFields);
                  if (ttl && ttl > 0) await redis.expire(key, ttl);
                }

                sendToSocket(ws, 'set-key-success', { key });
              } catch (writeErr: any) {
                sendToSocket(ws, 'error', { message: 'Write operation failed: ' + writeErr.message });
              }
            }
            break;
          }

          case 'del-key': {
            const { key } = payload;
            if (isMock) {
              const success = mockEngine.delKey(key);
              sendToSocket(ws, 'del-key-success', { key, success });
            } else {
              const redis = clientState!.redis!;
              try {
                const count = await redis.del(key);
                sendToSocket(ws, 'del-key-success', { key, success: count > 0 });
              } catch (delErr: any) {
                sendToSocket(ws, 'error', { message: 'Delete failed: ' + delErr.message });
              }
            }
            break;
          }

          case 'set-ttl': {
            const { key, ttl } = payload;
            if (isMock) {
              const success = mockEngine.setTtl(key, ttl);
              sendToSocket(ws, 'set-ttl-success', { key, success, ttl });
            } else {
              const redis = clientState!.redis!;
              try {
                let success = false;
                if (ttl < 0) {
                  const persistResult = await redis.persist(key);
                  success = persistResult > 0;
                } else {
                  const expireResult = await redis.expire(key, ttl);
                  success = expireResult > 0;
                }
                sendToSocket(ws, 'set-ttl-success', { key, success, ttl });
              } catch (ttlErr: any) {
                sendToSocket(ws, 'error', { message: 'Set TTL failed: ' + ttlErr.message });
              }
            }
            break;
          }

          case 'pubsub-subscribe': {
            const { channel } = payload;
            if (isMock) {
              mockEngine.subscribe(ws, channel);
            } else {
              const sub = clientState!.sub!;
              try {
                await sub.subscribe(channel);
                console.log(`Subscribed connection to pubsub channel: ${channel}`);

                // Set callback on message if not set already
                sub.on('message', (chan, msg) => {
                  if (chan === channel) {
                    const pubSubMsg: PubSubMessage = {
                      id: Math.random().toString(36).substr(2, 9),
                      channel: chan,
                      message: msg,
                      timestamp: new Date().toISOString(),
                    };
                    sendToSocket(ws, 'pubsub-msg', pubSubMsg);
                  }
                });
              } catch (pubSubErr: any) {
                sendToSocket(ws, 'error', { message: 'Pub/Sub subscription failed: ' + pubSubErr.message });
              }
            }
            break;
          }

          case 'pubsub-unsubscribe': {
            const { channel } = payload;
            if (isMock) {
              mockEngine.unsubscribe(ws, channel);
            } else {
              const sub = clientState!.sub!;
              try {
                await sub.unsubscribe(channel);
              } catch (unsubErr: any) {
                console.error('Unsubscribe error:', unsubErr);
              }
            }
            break;
          }

          case 'pubsub-publish': {
            const { channel, message: pubMessage } = payload;
            if (isMock) {
              const receiverCount = mockEngine.publish(channel, pubMessage);
              sendToSocket(ws, 'publish-response', { channel, receiverCount });
            } else {
              const redis = clientState!.redis!;
              try {
                const receiverCount = await redis.publish(channel, pubMessage);
                sendToSocket(ws, 'publish-response', { channel, receiverCount });
              } catch (pubErr: any) {
                sendToSocket(ws, 'error', { message: 'Publish failed: ' + pubErr.message });
              }
            }
            break;
          }

          case 'run-query': {
            const { command } = payload;
            if (isMock) {
              const responseStr = mockEngine.executeCommand(command);
              sendToSocket(ws, 'query-result', {
                command,
                status: responseStr.startsWith('ERR') || responseStr.startsWith('Error') ? 'error' : 'success',
                result: responseStr,
              });
            } else {
              const redis = clientState!.redis!;
              try {
                const parts = parseCommand(command);
                if (parts.length === 0) {
                  sendToSocket(ws, 'query-result', { command, status: 'error', result: 'ERR Empty command' });
                  return;
                }

                const cmdName = parts[0];
                const cmdArgs = parts.slice(1);

                // Run using call to support any arbitrary command
                const rawResult = await (redis as any).call(cmdName, ...cmdArgs);

                // Format the output cleanly like redis-cli
                const formatResult = (res: any): string => {
                  if (res === null || res === undefined) {
                    return '(nil)';
                  }
                  if (Array.isArray(res)) {
                    if (res.length === 0) return '(empty list or set)';
                    return res
                      .map((val, idx) => {
                        if (Array.isArray(val)) {
                          // nested array (like stream replies)
                          return `${idx + 1}) \n` + formatResult(val).split('\n').map(l => '   ' + l).join('\n');
                        }
                        return `${idx + 1}) "${val}"`;
                      })
                      .join('\n');
                  }
                  if (typeof res === 'object') {
                    return JSON.stringify(res, null, 2);
                  }
                  return String(res);
                };

                sendToSocket(ws, 'query-result', {
                  command,
                  status: 'success',
                  result: formatResult(rawResult),
                });
              } catch (cmdErr: any) {
                sendToSocket(ws, 'query-result', {
                  command,
                  status: 'error',
                  result: cmdErr.message || 'ERR Execution error',
                });
              }
            }
            break;
          }

          case 'get-stats': {
            if (isMock) {
              const stats: ServerStats = {
                redis_version: '2026.1.0_mock',
                connected_clients: String(wss.clients.size),
                used_memory_human: '1.24 MB',
                uptime_in_seconds: String(Math.floor(process.uptime())),
                total_commands_processed: '350',
                instantaneous_ops_per_sec: '4',
                keys_count: mockEngine.getKeys('*').length,
              };
              sendToSocket(ws, 'stats-results', stats);
            } else {
              const redis = clientState!.redis!;
              try {
                const infoRaw = await redis.info();
                const stats: ServerStats = {};

                // Parse INFO response fields
                infoRaw.split('\n').forEach((line) => {
                  const cleaned = line.trim();
                  if (cleaned && !cleaned.startsWith('#')) {
                    const [key, val] = cleaned.split(':');
                    if (key && val) {
                      if (key === 'redis_version') stats.redis_version = val;
                      else if (key === 'connected_clients') stats.connected_clients = val;
                      else if (key === 'used_memory_human') stats.used_memory_human = val;
                      else if (key === 'uptime_in_seconds') stats.uptime_in_seconds = val;
                      else if (key === 'total_commands_processed') stats.total_commands_processed = val;
                      else if (key === 'instantaneous_ops_per_sec') stats.instantaneous_ops_per_sec = val;
                    }
                  }
                });

                // Fetch total keys size
                const size = await redis.dbsize();
                stats.keys_count = size;

                sendToSocket(ws, 'stats-results', stats);
              } catch (infoErr: any) {
                sendToSocket(ws, 'stats-results', {
                  redis_version: 'Unknown',
                  keys_count: 0,
                  error: infoErr.message,
                });
              }
            }
            break;
          }

          case 'simulator-toggle': {
            const { active } = payload;
            if (active) {
              mockEngine.startSimulator();
              console.log('Background activity simulation enabled');
            } else {
              mockEngine.stopSimulator();
              console.log('Background activity simulation disabled');
            }
            sendToSocket(ws, 'simulator-status', { active });
            break;
          }
        }
      } catch (err: any) {
        console.error('WS raw command error:', err);
        sendToSocket(ws, 'error', { message: 'Invalid server action payload: ' + err.message });
      }
    });

    ws.on('close', () => {
      console.log('WS Connection closed');
      mockEngine.unsubscribeAll(ws);
      const clientState = activeClients.get(ws);
      if (clientState) {
        if (clientState.redis) clientState.redis.disconnect();
        if (clientState.sub) clientState.sub.disconnect();
        activeClients.delete(ws);
      }
    });
  });

  // Serve API check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), port: PORT });
  });

  // Integrate Vite Dev Server Middleware or serve static built outputs
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` RedisVue Modern server listening on port ${PORT}`);
    console.log(` Running in mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Connect your local client or browser to:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal initialization error starting RedisVue server:', err);
  process.exit(1);
});
