import React, { useState, useRef, useEffect } from 'react';
import { PubSubMessage } from '../types';
import { Radio, Plus, Trash2, Send, MessageSquare } from 'lucide-react';

interface PubSubPanelProps {
  messages: PubSubMessage[];
  subscribedChannels: string[];
  onSubscribe: (channel: string) => void;
  onUnsubscribe: (channel: string) => void;
  onPublish: (channel: string, message: string) => void;
  publishReceiverCount: { [channel: string]: number };
}

export default function PubSubPanel({
  messages,
  subscribedChannels,
  onSubscribe,
  onUnsubscribe,
  onPublish,
  publishReceiverCount,
}: PubSubPanelProps) {
  const [subInput, setSubInput] = useState('');
  const [pubChannel, setPubChannel] = useState('');
  const [pubMessage, setPubMessage] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the pubsub messages list on incoming data
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chan = subInput.trim();
    if (!chan) return;
    onSubscribe(chan);
    if (!pubChannel) setPubChannel(chan); // convenience defaults
    setSubInput('');
  };

  const handlePublishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chan = pubChannel.trim();
    const msg = pubMessage.trim();
    if (!chan || !msg) return;

    onPublish(chan, msg);
    setPubMessage('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-full flex flex-col md:flex-row overflow-hidden" id="pubsub-panel">
      {/* LEFT: Channels Subscriptions & Publisher */}
      <div className="w-full md:w-80 border-r border-slate-150 p-4 flex flex-col gap-4 shrink-0 bg-slate-50/50">
        
        {/* Subscribe Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Subscribe Channel</h3>
          </div>
          <form onSubmit={handleSubscribeSubmit} className="flex gap-1.5">
            <input
              type="text"
              placeholder="alerts:system or chat:*"
              className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-slate-700"
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              id="pubsub-sub-input"
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shrink-0"
              id="btn-pubsub-sub"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Subscribed Channels List */}
        <div className="flex-1 flex flex-col min-h-0">
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            My Subscriptions ({subscribedChannels.length})
          </label>
          {subscribedChannels.length === 0 ? (
            <div className="text-center p-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-medium">
              Not listening to any channel yet. Subscribe above!
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-44 md:max-h-none border border-slate-150 p-2 rounded-lg bg-white">
              {subscribedChannels.map((chan) => (
                <div
                  key={chan}
                  className="p-2 flex items-center justify-between gap-2 bg-slate-50 border border-slate-150 rounded-lg"
                  id={`sub-channel-${chan}`}
                >
                  <span
                    className="font-mono text-xs font-semibold text-slate-700 truncate cursor-pointer hover:text-indigo-600"
                    onClick={() => setPubChannel(chan)}
                    title="Click to select for publishing"
                  >
                    {chan}
                  </span>
                  <button
                    onClick={() => onUnsubscribe(chan)}
                    className="text-slate-400 hover:text-rose-500 p-1 rounded-md hover:bg-white"
                    title="Unsubscribe Channel"
                    id={`btn-unsubscribe-${chan}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-150 my-1" />

        {/* Publisher Section */}
        <div className="shrink-0 bg-white border border-slate-150 rounded-xl p-3.5 shadow-inner">
          <div className="flex items-center gap-1.5 mb-2">
            <Send className="w-3.5 h-3.5 text-indigo-500" />
            <h4 className="text-xs font-bold text-indigo-950">PUBLISH - Broadcast</h4>
          </div>

          <form onSubmit={handlePublishSubmit} className="space-y-2">
            <div>
              <input
                type="text"
                placeholder="Publish Channel"
                className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-slate-700"
                value={pubChannel}
                onChange={(e) => setPubChannel(e.target.value)}
                required
                id="pubsub-pub-channel"
              />
            </div>
            <div>
              <textarea
                placeholder="Message payload data..."
                className="w-full h-16 text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-700"
                value={pubMessage}
                onChange={(e) => setPubMessage(e.target.value)}
                required
                id="pubsub-pub-msg"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">
                {publishReceiverCount[pubChannel] !== undefined && (
                  <span className="font-semibold text-emerald-600 font-mono">
                    Received by {publishReceiverCount[pubChannel]} clients
                  </span>
                )}
              </span>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-3.5 rounded-lg text-xs transition-all shadow flex items-center gap-1"
                id="btn-pubsub-publish-submit"
              >
                <Send className="w-3 h-3" />
                Publish
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* RIGHT: Messages Log Stream */}
      <div className="flex-1 flex flex-col min-w-0 h-96 md:h-full">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 shrink-0">
          <MessageSquare className="w-4 h-4 text-indigo-600 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-800 font-display">Real-time Pub/Sub Logs</h3>
        </div>

        {/* Message streams */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 text-slate-100 font-mono text-xs space-y-2.5">
          {messages.length === 0 ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center h-full gap-2">
              <Radio className="w-10 h-10 text-slate-700 animate-pulse" />
              <p className="font-sans font-semibold">Listening to incoming pub/sub traffic...</p>
              <p className="font-sans text-[10px] text-slate-600 max-w-xs leading-relaxed">
                When you or another process publishes a message to a subscribed channel, it will instantly stream and display here.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="p-2.5 bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 rounded-lg flex items-start gap-2.5 leading-relaxed"
                id={`msg-log-${msg.id}`}
              >
                <div className="shrink-0 flex flex-col items-center">
                  <span className="text-[10px] text-indigo-400 font-bold bg-indigo-950 border border-indigo-900 py-0.5 px-1.5 rounded-md truncate max-w-[120px]" title={msg.channel}>
                    #{msg.channel}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-slate-200 break-words select-all">
                  "{msg.message}"
                </div>
                <div className="shrink-0 text-[10px] text-slate-500 font-sans self-center">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
