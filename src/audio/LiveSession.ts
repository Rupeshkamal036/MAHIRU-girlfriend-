import { AudioStreamer } from './AudioStreamer';
import { ReactionState, ReactionType, SessionState, ToolCallData, ToolResponseData } from '../types';

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onReaction: (reaction: ReactionState) => void;
  onError: (errorMsg: string, details?: { isPermissionError?: boolean; isInIframe?: boolean }) => void;
  onToolAction: (tool: ToolCallData) => void;
  onVisualizerUpdate: (userVol: number, aiVol: number, freqs: Uint8Array) => void;
  onMicStatusChange?: (available: boolean, errorMsg?: string) => void;
  onAmbientLightCommand?: (color: string, mode?: string) => void;
  onMovementCommand?: (action: string) => void;
  onInterrupted?: () => void;
  onConversationStyle?: (style: 'greeting' | 'explaining' | 'talking') => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private streamer: AudioStreamer | null = null;
  private state: SessionState = 'disconnected';
  private callbacks: LiveSessionCallbacks;
  private speakingTimeout: any = null;
  private pingInterval: any = null;
  private isDisconnecting: boolean = false;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): SessionState {
    return this.state;
  }

  public async connect(): Promise<void> {
    if (this.state !== 'disconnected') return;

    this.isDisconnecting = false;
    this.setState('connecting');

    try {
      // 1. Initialize audio capture and playback streamer
      this.streamer = new AudioStreamer(
        (base64Chunk: string) => {
          this.sendAudioChunk(base64Chunk);
        },
        (userVol, aiVol, freqs) => {
          this.callbacks.onVisualizerUpdate(userVol, aiVol, freqs);

          // Update state to speaking or listening dynamically based on active audio source
          if (this.state !== 'connecting' && this.state !== 'disconnected') {
            if (this.streamer?.isPlaying()) {
              if (this.state !== 'speaking') {
                this.setState('speaking');
              }
            } else if (this.state === 'speaking') {
              // Grace period before reverting to listening
              if (!this.speakingTimeout) {
                this.speakingTimeout = setTimeout(() => {
                  if (!this.streamer?.isPlaying() && this.state === 'speaking') {
                    this.setState('listening');
                  }
                  this.speakingTimeout = null;
                }, 300);
              }
            }
          }
        }
      );

      const { micAvailable, micError } = await this.streamer.start();
      if (this.callbacks.onMicStatusChange) {
        this.callbacks.onMicStatusChange(micAvailable, micError);
      }

      // 2. Open WebSocket to backend Live gateway
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      console.log('[LiveSession] Connecting to WebSocket at:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[LiveSession] Connected to Gemini Live server');
        this.setState('listening');

        // Start periodic keepalive heartbeat ping (every 20s)
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // ignore
            }
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return; // Heartbeat response
          this.handleServerMessage(msg);
        } catch (err) {
          console.log('[LiveSession] Message parsing note:', err);
        }
      };

      this.ws.onerror = () => {
        if (this.isDisconnecting || this.state === 'disconnected') {
          return;
        }
        console.log('[LiveSession] WebSocket connection notice - readyState:', this.ws?.readyState);
        if (this.state === 'connecting') {
          this.callbacks.onError('Unable to connect to live audio service. Please check your network connection.');
        }
      };

      this.ws.onclose = (ev) => {
        console.log('[LiveSession] WebSocket closed:', ev.code, ev.reason || 'Normal');
        const wasActive = this.state === 'listening' || this.state === 'speaking';
        const wasManual = this.isDisconnecting;
        this.disconnect();

        if (wasActive && !wasManual && ev.code !== 1000) {
          this.callbacks.onError('Voice connection was interrupted. Tap power to reconnect.');
        }
      };
    } catch (err: any) {
      console.log('[LiveSession] Connect notice:', err?.message || err);
      this.disconnect();

      const errMsg = String(err?.message || err || '');
      const errName = String(err?.name || '');

      const isPermissionDenied =
        errName === 'NotAllowedError' ||
        errName === 'SecurityError' ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('not allowed') ||
        errMsg.toLowerCase().includes('denied');

      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

      let userFriendlyMessage = errMsg || 'Microphone initialization notice.';
      if (isPermissionDenied) {
        userFriendlyMessage = isInIframe
          ? 'Microphone permission blocked by preview frame. Open in a new tab to allow microphone.'
          : 'Microphone permission denied. Please allow microphone access in your browser.';
      }

      this.callbacks.onError(userFriendlyMessage, {
        isPermissionError: isPermissionDenied,
        isInIframe,
      });
    }
  }

  public disconnect(): void {
    this.isDisconnecting = true;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Normal Disconnect');
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }

    if (this.streamer) {
      this.streamer.stop();
      this.streamer = null;
    }

    this.setState('disconnected');
    this.isDisconnecting = false;
  }

  public toggleMute(): boolean {
    if (!this.streamer) return false;
    const nextMute = !this.streamer.getIsMuted();
    this.streamer.setMute(nextMute);
    return nextMute;
  }

  public isMuted(): boolean {
    return this.streamer ? this.streamer.getIsMuted() : false;
  }

  public interrupt(): void {
    if (this.streamer) {
      this.streamer.interrupt();
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send interrupt signal to server
      this.ws.send(JSON.stringify({ type: 'interrupt' }));
    }
    this.setState('listening');
  }

  public sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[LiveSession] Cannot send text message: socket not open');
      return;
    }
    this.ws.send(JSON.stringify({ type: 'text', text }));
    this.setState('speaking');
  }

  public sendMediaAttachment(base64Data: string, mimeType: string, filename: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[LiveSession] Cannot send media: socket not open');
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: 'media',
        mimeType,
        data: base64Data,
        filename,
      })
    );
  }

  public async enableMicrophone(): Promise<{ success: boolean; error?: string }> {
    if (!this.streamer) return { success: false, error: 'Audio streamer not initialized' };
    try {
      const ok = await this.streamer.initMicrophone();
      if (this.callbacks.onMicStatusChange) {
        this.callbacks.onMicStatusChange(ok);
      }
      return { success: ok };
    } catch (err: any) {
      console.log('[LiveSession] Microphone access notice:', err?.message || err);
      if (this.callbacks.onMicStatusChange) {
        this.callbacks.onMicStatusChange(false, err?.message);
      }
      return { success: false, error: err?.message || 'Permission denied' };
    }
  }

  public isMicAvailable(): boolean {
    return this.streamer ? this.streamer.isMicrophoneAvailable() : false;
  }

  private sendAudioChunk(base64Data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'audio',
          data: base64Data,
        })
      );
    }
  }

  private handleServerMessage(msg: any): void {
    switch (msg.type) {
      case 'audio':
        if (msg.data && this.streamer) {
          this.streamer.playChunk(msg.data);
          this.setState('speaking');
        }
        break;

      case 'interrupted':
        console.log('[LiveSession] Interrupted by model or user');
        if (this.streamer) {
          this.streamer.interrupt();
        }
        this.setState('listening');
        if (this.callbacks.onInterrupted) {
          this.callbacks.onInterrupted();
        }
        break;

      case 'turnComplete':
        console.log('[LiveSession] Model turn complete');
        // Will revert to listening once audio buffer drains
        break;

      case 'toolCall':
        this.handleToolCall(msg.toolCall);
        break;

      case 'conversationStyle':
        if (msg.style && this.callbacks.onConversationStyle) {
          const st = String(msg.style).toLowerCase();
          if (st.includes('greet')) {
            this.callbacks.onConversationStyle('greeting');
          } else if (st.includes('explain')) {
            this.callbacks.onConversationStyle('explaining');
          } else {
            this.callbacks.onConversationStyle('talking');
          }
        }
        break;

      case 'textChunk':
        if (msg.text && typeof msg.text === 'string') {
          const trimmed = msg.text.trim();
          const lower = trimmed.toLowerCase();

          // 1. Conversation style detection
          if (this.callbacks.onConversationStyle) {
            if (/^(hello|hi\b|hey\b|namaste|salaam|kaise ho|welcome)/i.test(lower)) {
              this.callbacks.onConversationStyle('greeting');
            } else if (/^(let me explain|here is how|basically|first,|the reason|step 1)/i.test(lower)) {
              this.callbacks.onConversationStyle('explaining');
            }
          }

          // 2. Real-time emotion intent check (in case tool call wasn't invoked)
          if (this.callbacks.onReaction) {
            if (/(\bhahaha\b|\bhehehe\b|\bhaha\b|\bhehe\b|\blol\b|\brofl\b|\*laughs?\*|\*giggles?\*)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'laughing', timestamp: Date.now() });
            } else if (/\b(thank you|thanks baby|bohot shukriya|dhanyawad|so grateful|thankful)\b/i.test(lower)) {
              this.callbacks.onReaction({ type: 'thankful', timestamp: Date.now() });
            } else if (/(\bwhat\?!|\breally\?!|\bsach me\?!|\bohmigod\b|\bno way\?!|\*gasps?\*|\bshocked\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'surprised', timestamp: Date.now() });
            } else if (/(\byay!|\bwoohoo\b|\boh wow!|\bthat's amazing!|\bso excited\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'excited', timestamp: Date.now() });
            } else if (/(\bso relieved\b|\bthank goodness\b|\bsukoon mila\b|\bchalo bach gaye\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'relieved', timestamp: Date.now() });
            } else if (/(\bwait\.\.\.|\bmujhe samajh nahi aaya\b|\bi don't understand\b|\bso confused\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'confused', timestamp: Date.now() });
            } else if (/(\bumm\.\.\. aise mat bolo\b|\bblushing\b|\byou're making me blush\b|\bsharam aa rahi\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'shy', timestamp: Date.now() });
            } else if (/(\bso sleepy\b|\bmujhe neend aa rahi\b|\bfeeling sleepy\b|\bso tired\b|\*yawns?\*)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'sleepy', timestamp: Date.now() });
            } else if (/(\boh, haan, mujhe yaad aaya\b|\boh haan yaad aaya\b|\bnow i remember\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'remembering', timestamp: Date.now() });
            } else if (/(\*sighs?\*|\ba deep breath\b|\btaking a breath\b|\bwhew\b)/i.test(lower)) {
              this.callbacks.onReaction({ type: 'sigh', timestamp: Date.now() });
            }
          }
        }
        break;

      case 'error':
        console.log('[LiveSession] Server reported notice:', msg.error);
        this.callbacks.onError(msg.error || 'Server error occurred');
        break;

      default:
        // Other meta messages
        break;
    }
  }

  private handleToolCall(toolCall: any): void {
    console.log('[LiveSession] Received toolCall:', toolCall);

    const functionCalls = toolCall.functionCalls || [];
    const responses: any[] = [];

    for (const fc of functionCalls) {
      const callId = fc.id;
      const funcName = fc.name;
      const args = fc.args || {};

      this.callbacks.onToolAction({ id: callId, name: funcName, args });

      let result: Record<string, any> = { success: true };

      if (funcName === 'openWebsite') {
        const url = args.url;
        const siteName = args.siteName || url;
        try {
          // Attempt to open in a new window/tab
          const opened = window.open(url, '_blank', 'noopener,noreferrer');
          result = {
            status: opened ? 'opened' : 'blocked_by_browser',
            url: url,
            siteName: siteName,
            note: opened ? 'Website opened in new tab' : 'Popup blocked; notify user with visual notification',
          };
        } catch (err: any) {
          result = { status: 'error', error: err.message, url: url };
        }
      } else if (funcName === 'showVisualReaction') {
        const rawReaction = args.reaction || args.emotion || args.mood || args.type || 'happy';
        const reaction = String(rawReaction).toLowerCase() as ReactionType;
        this.callbacks.onReaction({
          type: reaction,
          comment: args.comment || '',
          timestamp: Date.now(),
        });
        result = { reactionShown: reaction, status: 'displayed' };
      } else if (funcName === 'changeAmbientLight') {
        const color = args.color || 'blue';
        const mode = args.mode || 'set_color';
        if (this.callbacks.onAmbientLightCommand) {
          this.callbacks.onAmbientLightCommand(color, mode);
        }
        result = { status: 'ambient_lighting_updated', color, mode };
      } else if (funcName === 'triggerMovement') {
        const action = args.action || 'walk';
        if (this.callbacks.onMovementCommand) {
          this.callbacks.onMovementCommand(action);
        }
        result = { status: 'movement_triggered', action };
      } else if (funcName === 'setConversationAnimation' || funcName === 'setSpeechStyle') {
        const style = (args.style || args.animation || 'talking').toLowerCase();
        if (this.callbacks.onConversationStyle) {
          if (style.includes('greet')) {
            this.callbacks.onConversationStyle('greeting');
          } else if (style.includes('explain')) {
            this.callbacks.onConversationStyle('explaining');
          } else {
            this.callbacks.onConversationStyle('talking');
          }
        }
        result = { status: 'conversation_animation_set', style };
      } else if (funcName === 'getDateTime') {
        const now = new Date();
        result = {
          currentTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          currentDate: now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      } else {
        result = { status: 'handled', name: funcName };
      }

      responses.push({
        id: callId,
        name: funcName,
        response: result,
      });
    }

    // Send toolResponse instantly back to Gemini Live
    if (responses.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'toolResponse',
          functionResponses: responses,
        })
      );
    }
  }

  private setState(newState: SessionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange(newState);
    }
  }
}
