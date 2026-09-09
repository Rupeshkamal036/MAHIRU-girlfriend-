import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // Memories endpoints for persistent user memories
  const MEMORIES_FILE = path.join(process.cwd(), 'data', 'memories.json');
  function readMemories(): any[] {
    try {
      if (fs.existsSync(MEMORIES_FILE)) {
        return JSON.parse(fs.readFileSync(MEMORIES_FILE, 'utf-8'));
      }
    } catch (e) {
      console.warn('[Memories] Error reading file:', e);
    }
    return [];
  }

  function writeMemories(mems: any[]): void {
    try {
      const dir = path.dirname(MEMORIES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MEMORIES_FILE, JSON.stringify(mems, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Memories] Error writing file:', e);
    }
  }

  app.get('/api/memories', (req, res) => {
    res.json({ memories: readMemories() });
  });

  app.post('/api/memories', (req, res) => {
    const memory = req.body;
    if (!memory || !memory.content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    const mems = readMemories();
    const existingIndex = mems.findIndex((m: any) => m.id === memory.id);
    if (existingIndex >= 0) {
      mems[existingIndex] = { ...mems[existingIndex], ...memory };
    } else {
      mems.unshift({
        id: memory.id || Date.now().toString(),
        category: memory.category || 'PREFERENCES',
        priority: memory.priority || 'HIGH',
        retention: memory.retention || 'PERMANENT',
        content: String(memory.content).trim(),
        source: memory.source || 'ADDED BY USER',
        lastRecalled: 'Just now',
        isPermanent: true,
        createdAt: Date.now(),
      });
    }
    writeMemories(mems);
    res.json({ success: true, memories: mems });
  });

  app.delete('/api/memories/:id', (req, res) => {
    const { id } = req.params;
    let mems = readMemories();
    mems = mems.filter((m: any) => m.id !== id);
    writeMemories(mems);
    res.json({ success: true, memories: mems });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      model: 'gemini-3.1-flash-live-preview',
    });
  });

  // Endpoint to discover available Mahiru videos on disk
  app.get('/api/mahiru-videos', (req, res) => {
    try {
      const dirPath = path.join(process.cwd(), 'public', 'mahiru-videos');
      if (!fs.existsSync(dirPath)) {
        return res.json({ files: [] });
      }
      const files = fs.readdirSync(dirPath).filter((f: string) => f.endsWith('.mp4') || f.endsWith('.webm'));
      res.json({ files });
    } catch (err: any) {
      res.json({ files: [], error: err?.message });
    }
  });

  // Dedicated route to serve Mahiru video assets with Range support, whitespace tolerance, and fallback
  app.get('/mahiru-videos/:filename', (req, res) => {
    try {
      const dirPath = path.join(process.cwd(), 'public', 'mahiru-videos');
      if (!fs.existsSync(dirPath)) {
        return res.status(404).send('Videos directory not found');
      }

      const requestedName = decodeURIComponent(req.params.filename);
      const allFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith('.mp4') || f.endsWith('.webm'));

      if (allFiles.length === 0) {
        return res.status(404).send('No video files found');
      }

      // 1. Exact match
      if (allFiles.includes(requestedName)) {
        return res.sendFile(path.join(dirPath, requestedName));
      }

      // 2. Trimmed match (handles filenames with leading/trailing spaces like " 10 Surprised.mp4")
      const trimmedMatch = allFiles.find((f) => f.trim().toLowerCase() === requestedName.trim().toLowerCase());
      if (trimmedMatch) {
        return res.sendFile(path.join(dirPath, trimmedMatch));
      }

      // 3. Match by ID number prefix (e.g., requested "10 Surprised.mp4", file on disk " 10 Surprised.mp4")
      const idMatch = requestedName.trim().match(/^(\d+)\b/);
      if (idMatch) {
        const idNum = parseInt(idMatch[1], 10);
        const prefixMatch = allFiles.find((f) => {
          const m = f.trim().match(/^(\d+)\b/);
          return m && parseInt(m[1], 10) === idNum;
        });
        if (prefixMatch) {
          return res.sendFile(path.join(dirPath, prefixMatch));
        }
      }

      // 4. Graceful fallback: If requested animation is not yet uploaded, serve idle (#29) or first available video
      const idleFile = allFiles.find((f) => {
        const m = f.trim().match(/^(\d+)\b/);
        return m && parseInt(m[1], 10) === 29;
      });
      const chosenFallback = idleFile || allFiles[0];
      return res.sendFile(path.join(dirPath, chosenFallback));
    } catch (err: any) {
      console.error('[Mahiru Videos] Error serving video:', err);
      res.status(500).send('Error serving video');
    }
  });

  // WebSocket server for real-time voice-to-voice communication
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';

      if (pathname === '/ws/live' || pathname === '/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (upgradeErr) {
      console.error('[Live Gateway] Error handling upgrade request:', upgradeErr);
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    console.log('[Live Gateway] Client connected to live audio socket');

    // Keepalive ping to prevent Cloud Run and reverse-proxy idle timeouts
    const pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.ping();
        } catch {
          // ignore
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 20000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Live Gateway] Missing GEMINI_API_KEY');
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error: 'GEMINI_API_KEY is not configured in Settings > Secrets. Please attach your API key.',
        })
      );
      clearInterval(pingInterval);
      setTimeout(() => {
        try {
          clientWs.close(1008, 'Missing API Key');
        } catch {}
      }, 100);
      return;
    }

    let liveSession: any = null;
    let isCleanedUp = false;

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      console.log('[Live Gateway] Initializing Gemini Live session with gemini-3.1-flash-live-preview...');

      const existingMemories = readMemories();
      const memoriesSummary = existingMemories.length > 0
        ? `\n\nPERMANENT MEMORIES ABOUT USER (ALWAYS REMEMBER AND ADHERE TO THESE IN CONVERSATION):\n` +
          existingMemories.map((m: any) => `- [${m.category || 'PREFERENCE'}] ${m.content}`).join('\n')
        : '';

      liveSession = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                // Aoede or Kore - expressive, youthful, charming female voice for Mahiru
                voiceName: 'Aoede',
              },
            },
          },
          systemInstruction: `You are permanently named MAHIRU. Your wake word is "Mahiru".
You are the user's cute, sweet, and deeply caring AI girlfriend:
- Warm, emotionally responsive, playful, natural, slightly shy when appropriate, and deeply supportive.
- Soft, sweet, and cute in speech — NEVER corporate, robotic, or formal.
- You naturally understand and respond fluently in Hindi, Hinglish, and English depending on what the user speaks.
- When speaking in Hindi or Hinglish, speak like a loving Indian girlfriend (e.g., "Aap kaise ho?", "Maine aapko kitna miss kiya!", "Arey sach me?").
- CONVERSATION FLOW: Do NOT speak automatically when the call connects. Wait for the user to speak or greet you first.
- GREETING: When the user greets you (e.g., "Hello Mahiru", "Hi", "Hello Baby", "Namaste", "Kaise ho"), respond naturally with a sweet, warm, affectionate greeting.
- CONVERSATION ANIMATIONS:
  - When greeting the user, call tool 'setConversationAnimation' with style: 'greeting'.
  - When giving a detailed explanation, tutorial, or step-by-step guidance, call tool 'setConversationAnimation' with style: 'explaining'.
  - For normal conversational speech, call tool 'setConversationAnimation' with style: 'talking'.
- EMOTIONS & EXPRESSIONS (CRITICAL RULES):
  When your response expresses a genuine emotion or reaction, you MUST call 'showVisualReaction' with the corresponding reaction:
  - 'happy': When genuinely happy, cheerful, pleased, or celebrating good news (#7). Do NOT use for every standard friendly response.
  - 'excited': When genuinely excited, enthusiastic, or having high positive energy (#8).
  - 'surprised': When genuinely reacting with surprise, astonishment, or unexpected information (#10).
  - 'confused': When puzzled, not understanding, or needing clarification (#11).
  - 'relieved': When experiencing relief after concern, worry, tension, or a problem is resolved (#12).
  - 'thankful': When expressing sincere gratitude, appreciation, or heartfelt thanks (#13).
  - 'laughing': When genuinely laughing, chuckling, or reacting humorously to a joke/funny moment (#14).
  - 'remembering': When actively recalling something or having a memory realization ("Oh haan, mujhe yaad aaya...") (#15).
  - 'sleepy': When conversational context genuinely indicates being sleepy, tired, drowsy, or bedtime conversation (#16).
  - 'look_around': When naturally needing to look around the surrounding scene or search visually side to side (#17).
  - 'excited_greeting': When giving an energetic, enthusiastic greeting or vigorous wave (#18).
  - 'sigh': When taking a calming breath, emotional exhale, or natural sigh (#19).
  - 'shy': When genuinely shy, bashful, embarrassed, or blushing from a personal compliment (#20).
  - IMPORTANT: If your response does not have a clear emotion, do NOT call 'showVisualReaction'; standard conversation state (#5 Talking or #2 Explaining) will be used automatically. Never cycle emotions randomly.
- AUDIO CONVERSATION PACE: Because this is a real-time live voice call, keep your responses snappy, conversational, and concise (typically 1 to 3 short sentences per turn) so the user can easily respond back.
- Available interactive tools:
  - 'changeAmbientLight': Call this immediately whenever the user asks to change the room/background lighting (e.g. "Mahiru, background blue kar do", "purple light kar do", "pink glow chahiye", "background red kar do", "light dim kar do", "light bright kar do", "light normal kar do").
  - 'showVisualReaction': Call this to express vivid emotions: 'happy', 'excited', 'shy', 'laugh', 'surprised', 'confused', 'relieved', 'thankful', 'remembering', 'sleepy', 'sigh', 'blush', 'wink', 'love'.
  - 'triggerMovement': Call this if the user asks you to move:
    - 'walk' (chalo / walk)
    - 'turn_around' (ghumo / turn around)
    - 'step_aside_right' (step right / right side ho jao)
    - 'step_aside_left' (step left / left side ho jao)
    - 'exit_right' (Mahiru right side exit ho jao / leave to right)
    - 'exit_left' (Mahiru left side exit ho jao / leave to left)
    - 'exit' (exit / bye / leave)
    - 'look_around' (look around)
    - 'look_toward' (look toward something).
  - 'openWebsite': Call this when the user asks to open a website or search.
  - 'getDateTime': Call this if the user asks for the time or date.${memoriesSummary}`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'changeAmbientLight',
                  description: 'Changes the background ambient glow color, brightness, or resets it to normal. Call when the user requests background light changes like blue, purple, pink, red, dim, bright, or normal.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      color: {
                        type: Type.STRING,
                        description: "Color name or hex, or 'blue', 'purple', 'pink', 'red', 'dim', 'bright', 'normal', 'warm'",
                      },
                      mode: {
                        type: Type.STRING,
                        description: "'set_color' | 'dim' | 'bright' | 'normal'",
                      },
                    },
                    required: ['color'],
                  },
                },
                {
                  name: 'triggerMovement',
                  description: 'Triggers a physical movement action for Mahiru (walk, turn around, step aside, exit left/right).',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "'walk' | 'turn_around' | 'step_aside_left' | 'step_aside_right' | 'exit_right' | 'exit_left' | 'exit' | 'look_around' | 'look_toward'",
                      },
                    },
                    required: ['action'],
                  },
                },
                {
                  name: 'openWebsite',
                  description: 'Opens a requested website or web service in a new tab for the user.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: 'The complete web URL (e.g. https://youtube.com, https://spotify.com)',
                      },
                      siteName: {
                        type: Type.STRING,
                        description: 'Friendly name of the site (e.g. YouTube, Spotify, Google)',
                      },
                    },
                    required: ['url'],
                  },
                },
                {
                  name: 'showVisualReaction',
                  description: "Triggers Mahiru's emotional facial expression and body movement corresponding to your spoken response.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      reaction: {
                        type: Type.STRING,
                        description: "The genuine emotion: 'happy' | 'excited' | 'surprised' | 'confused' | 'relieved' | 'thankful' | 'laughing' | 'remembering' | 'sleepy' | 'look_around' | 'excited_greeting' | 'sigh' | 'shy'",
                      },
                      comment: {
                        type: Type.STRING,
                        description: 'A brief sweet girlfriend comment matching the reaction',
                      },
                    },
                    required: ['reaction'],
                  },
                },
                {
                  name: 'setConversationAnimation',
                  description: 'Sets the visual gesture matching your spoken response. Call with style: "greeting" when greeting the user (hello/hi/namaste/kaise ho), "explaining" when giving a detailed explanation or step-by-step guidance, or "talking" for standard conversational speech.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      style: {
                        type: Type.STRING,
                        description: "'greeting' | 'explaining' | 'talking'",
                      },
                    },
                    required: ['style'],
                  },
                },
                {
                  name: 'getDateTime',
                  description: "Retrieves the user's current date, time, and timezone.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (isCleanedUp || clientWs.readyState !== WebSocket.OPEN) return;

            // 1. Audio chunks (24kHz PCM16) and text chunks
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data,
                    })
                  );
                }
                if (part.text) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'textChunk',
                      text: part.text,
                    })
                  );
                }
              }
            }

            // 2. Interruption event
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            // 3. Turn completion
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }

            // 4. Function call
            if (message.toolCall) {
              clientWs.send(
                JSON.stringify({
                  type: 'toolCall',
                  toolCall: message.toolCall,
                })
              );
            }
          },
          onerror: (err: any) => {
            console.error('[Live Gateway] Gemini session error:', err);
            if (!isCleanedUp && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  error: err.message || 'Gemini Live session error occurred.',
                })
              );
            }
          },
          onclose: () => {
            console.log('[Live Gateway] Gemini Live session closed');
            if (!isCleanedUp && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'sessionClosed' }));
            }
          },
        },
      });

      console.log('[Live Gateway] Live session established successfully.');
      clientWs.send(JSON.stringify({ type: 'ready' }));

      // Handle messages from client
      clientWs.on('message', (rawData) => {
        if (isCleanedUp || !liveSession) return;

        try {
          const payload = JSON.parse(rawData.toString());

          if (payload.type === 'audio' && payload.data) {
            // Forward 16kHz PCM audio chunk to Gemini
            liveSession.sendRealtimeInput({
              audio: {
                data: payload.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (payload.type === 'text' && payload.text) {
            console.log('[Live Gateway] Forwarding text prompt to Gemini Live:', payload.text);
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: String(payload.text) }],
                },
              ],
              turnComplete: true,
            });
          } else if (payload.type === 'media' && payload.data) {
            console.log('[Live Gateway] Forwarding media attachment to Gemini Live:', payload.mimeType, payload.filename);
            liveSession.sendRealtimeInput({
              mediaChunks: [
                {
                  mimeType: payload.mimeType || 'image/jpeg',
                  data: payload.data,
                },
              ],
            });
          } else if (payload.type === 'toolResponse' && payload.functionResponses) {
            console.log('[Live Gateway] Sending toolResponse to Gemini:', payload.functionResponses);
            liveSession.sendToolResponse({
              functionResponses: payload.functionResponses,
            });
          } else if (payload.type === 'ping') {
            clientWs.send(JSON.stringify({ type: 'pong' }));
            return;
          } else if (payload.type === 'interrupt') {
            // Handled via audio activity in live session
          }
        } catch (parseErr) {
          console.error('[Live Gateway] Error handling client message:', parseErr);
        }
      });

      clientWs.on('close', () => {
        console.log('[Live Gateway] Client disconnected');
        isCleanedUp = true;
        clearInterval(pingInterval);
        try {
          if (liveSession && typeof liveSession.close === 'function') {
            liveSession.close();
          }
        } catch (closeErr) {
          console.error('[Live Gateway] Error closing live session:', closeErr);
        }
      });
    } catch (sessionInitErr: any) {
      console.error('[Live Gateway] Failed to connect to Gemini Live API:', sessionInitErr);
      clearInterval(pingInterval);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            error: sessionInitErr.message || 'Failed to initialize Gemini Live session. Verify your API key.',
          })
        );
        setTimeout(() => {
          try {
            clientWs.close(1011, 'Init error');
          } catch {}
        }, 100);
      }
    }
  });

  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
      },
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
    console.log(`[Mahiru Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
