import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  getMemories,
  createMemory,
  deleteMemory,
  resolveUserIdFromRequest,
  DEFAULT_USER_ID,
  getMemoryStoreHealth,
} from './server/memoryStore';
import { extractMemoryCandidates, containsSensitiveCredentials } from './server/memoryExtractor';
import { persistMemoryCandidates } from './server/memoryPersistence';
import { findExactDuplicateMemory, evaluateMemoryDecision } from './server/memoryCategorySchema';
import {
  isAutomaticMemorySavingEnabled,
  setAutomaticMemorySaving,
  resetAutomaticMemorySavingSession,
  isExplicitSaveCommand,
} from './server/automaticMemorySaving';
import { liveMemoryBridge } from './server/liveMemoryBridge';
import {
  executeVoiceDeleteMemory,
  executeVoiceSaveMemory,
  resolveMemoryForDeletion,
  isDeleteIntent,
  executeMemoryUpdate,
  resolveMemoryForUpdate,
  isUpdateIntent,
  executeVoiceToggleSecurity,
  isSecurityToggleIntent,
  isDeleteAllIntent,
} from './server/memoryResolver';
import { isFirestoreAvailable, TARGET_FIRESTORE_DATABASE_ID, TARGET_FIREBASE_PROJECT_ID } from './server/firebaseAdmin';
import {
  getSecurityConfig,
  getSanitizedSecurityStatus,
  setupInitialPin,
  setupInitialCodeword,
  changePin,
  changeCodeword,
  toggleSecurity,
  verifySecurityCredentials,
  resetSecurityCredentials,
  authorizeSingleMemoryDelete,
  authorizeDeleteAllMemories,
  isOwnerNameMemory,
  isBlankOrPlaceholderCodeword,
  initializeSecurityForNewSession,
} from './server/memorySecurity';

dotenv.config();

const PORT = 3000;

export function resolveSessionIdFromRequest(req: express.Request): string | undefined {
  const header = req.headers['x-session-id'] || req.headers['session-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  const query = req.query.sessionId || req.query.session_id;
  if (typeof query === 'string' && query.trim()) return query.trim();
  const body = req.body?.sessionId || req.body?.session_id;
  if (typeof body === 'string' && body.trim()) return body.trim();
  return undefined;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  let broadcastMemoryEvent: (event: any) => void = () => {};

  app.use(express.json());

  // Cloud persistent memory endpoints via server/memoryStore.ts
  app.get('/api/memories', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const memories = await getMemories(userId, { category });
      res.json({ success: true, memories });
    } catch (error: any) {
      console.error('[API] GET /api/memories error:', error?.message || error);
      res.status(error?.statusCode || 500).json({
        success: false,
        error: error?.message || 'Failed to retrieve persistent memories from Firestore',
      });
    }
  });

  app.post('/api/memories', async (req, res) => {
    try {
      const memory = req.body;
      if (!memory || (!memory.content && !memory.value)) {
        return res.status(400).json({ success: false, error: 'Memory content is required' });
      }
      const userId = resolveUserIdFromRequest(req);
      const existingMemories = await getMemories(userId);

      // Memory creation decision evaluation: EXACT_DUPLICATE | NEW_MEMORY | SIMILAR_REQUIRES_USER_DECISION
      const isExplicitNew = Boolean(
        memory.isExplicitNew ||
        memory.explicitNew ||
        memory.source === 'explicit_new_memory' ||
        (memory.content && isExplicitSaveCommand(memory.content)) ||
        (memory.rawText && isExplicitSaveCommand(memory.rawText))
      );

      const decisionEval = evaluateMemoryDecision(
        { ...memory, isExplicitNew },
        existingMemories,
        { isExplicitNewMemory: isExplicitNew, rawText: memory.content || memory.rawText }
      );
      if (decisionEval.decision === 'EXACT_DUPLICATE') {
        return res.json({
          success: true,
          duplicate: true,
          status: 'duplicate',
          decision: 'EXACT_DUPLICATE',
          message: 'Ye memory pehle se saved hai.',
          memory: decisionEval.existingMemory,
          memories: existingMemories,
        });
      }

      if (decisionEval.decision === 'SIMILAR_REQUIRES_USER_DECISION') {
        return res.json({
          success: true,
          status: 'similar_requires_decision',
          decision: 'SIMILAR_REQUIRES_USER_DECISION',
          message: decisionEval.clarificationPrompt,
          clarificationPrompt: decisionEval.clarificationPrompt,
          existingMemory: decisionEval.existingMemory,
          memories: existingMemories,
        });
      }

      const saved = await createMemory(userId, memory);
      const memories = await getMemories(userId);
      broadcastMemoryEvent({ type: 'memoryPersisted', action: 'create', memory: saved });
      res.json({ success: true, memory: saved, memories });
    } catch (error: any) {
      console.error('[API] POST /api/memories error:', error?.message || error);
      res.status(error?.statusCode || 500).json({
        success: false,
        error: error?.message || 'Failed to persist memory in Firestore',
      });
    }
  });

  app.delete('/api/memories', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const rawCodeword =
        req.body?.codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const codeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
      const pin = req.body?.pin || req.query?.pin || (req.headers['x-pin'] as string);

      const auth = await authorizeDeleteAllMemories(userId, { codeword, pin }, sessionId);
      if (!auth.authorized) {
        return res.status(auth.requiresCodeword ? 403 : 401).json({
          success: false,
          status: auth.requiresCodeword ? 'codeword_required' : 'auth_failed',
          requiresCodeword: Boolean(auth.requiresCodeword),
          error: auth.reason || (auth.requiresCodeword ? 'Codeword is required to delete all permanent memories.' : 'Incorrect Codeword. Delete all rejected.'),
        });
      }

      const all = await getMemories(userId);
      await Promise.all(all.map((m) => deleteMemory(userId, m.id)));
      broadcastMemoryEvent({ type: 'memoryPersisted', action: 'clearAll' });
      res.json({ success: true, memories: [] });
    } catch (error: any) {
      console.error('[API] DELETE /api/memories error:', error?.message || error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to clear memories' });
    }
  });

  app.delete('/api/memories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || !id.trim()) {
        return res.status(400).json({ success: false, error: 'Memory ID is required' });
      }
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      if (id.trim() === 'all') {
        const rawCodeword =
          req.body?.codeword ||
          req.query?.codeword ||
          (req.headers['x-codeword'] as string) ||
          (req.headers['x-security-codeword'] as string);
        const codeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
        const pin = req.body?.pin || req.query?.pin || (req.headers['x-pin'] as string);

        const auth = await authorizeDeleteAllMemories(userId, { codeword, pin }, sessionId);
        if (!auth.authorized) {
          return res.status(auth.requiresCodeword ? 403 : 401).json({
            success: false,
            status: auth.requiresCodeword ? 'codeword_required' : 'auth_failed',
            requiresCodeword: Boolean(auth.requiresCodeword),
            error: auth.reason || (auth.requiresCodeword ? 'Codeword is required to delete all permanent memories.' : 'Incorrect Codeword. Delete all rejected.'),
          });
        }

        const all = await getMemories(userId);
        await Promise.all(all.map((m) => deleteMemory(userId, m.id)));
        broadcastMemoryEvent({ type: 'memoryPersisted', action: 'clearAll' });
        return res.json({ success: true, memories: [] });
      }

      // Check single memory delete authorization (Step 4 & Sub-issue 1)
      const allMemories = await getMemories(userId);
      const targetMem = allMemories.find((m) => m.id === id.trim());
      const isOwner = targetMem ? isOwnerNameMemory(targetMem) : false;

      const codeword =
        req.body?.codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const pin = req.body?.pin || req.query?.pin || (req.headers['x-pin'] as string);
      const auth = await authorizeSingleMemoryDelete(
        userId,
        { codeword, pin },
        { isOwnerName: isOwner, targetMemory: targetMem },
        sessionId
      );
      if (!auth.authorized) {
        return res.status(auth.requiresCodeword ? 403 : 401).json({
          success: false,
          status: auth.requiresCodeword ? 'codeword_required' : 'auth_failed',
          requiresCodeword: Boolean(auth.requiresCodeword),
          error: auth.reason || (auth.requiresCodeword
            ? (isOwner ? 'Codeword is required to delete owner name.' : 'Security is ON. Secret Codeword is required to delete a permanent memory.')
            : 'Incorrect Codeword. Memory deletion rejected.'),
        });
      }

      const deleted = await deleteMemory(userId, id.trim());
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Memory not found or access denied in Firestore' });
      }
      const memories = await getMemories(userId);
      broadcastMemoryEvent({ type: 'memoryPersisted', action: 'delete', id: id.trim() });
      res.json({ success: true, memories });
    } catch (error: any) {
      console.error('[API] DELETE /api/memories/:id error:', error?.message || error);
      res.status(error?.statusCode || 500).json({
        success: false,
        error: error?.message || 'Failed to delete memory from Firestore',
      });
    }
  });

  // Voice/natural language memory deletion endpoint
  app.post('/api/memories/voice-delete', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const { query, memoryId, codeword, pin } = req.body;
      const result = await executeVoiceDeleteMemory(
        userId,
        query,
        memoryId,
        broadcastMemoryEvent,
        { codeword, pin, sessionId } as any
      );
      res.json(result);
    } catch (error: any) {
      console.error('[API] POST /api/memories/voice-delete error:', error?.message || error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'Failed to process voice memory deletion',
      });
    }
  });

  // Voice/natural language or programmatic memory update endpoint (STEP 3)
  app.post(['/api/memories/voice-update', '/api/memories/update'], async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const { query, memoryId, newValue, content, value, codeword, pin, rawText } = req.body;
      const rawCodeword =
        codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const effectiveCodeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
      const effectivePin = pin || req.query?.pin || (req.headers['x-pin'] as string);
      const result = await executeMemoryUpdate(
        {
          userId,
          query,
          memoryId,
          newValue: newValue || content || value,
          codeword: effectiveCodeword,
          pin: effectivePin,
          rawText,
          sessionId,
        },
        broadcastMemoryEvent
      );

      if (!result.success) {
        if (result.status === 'codeword_required') {
          return res.status(403).json(result);
        }
        if (result.status === 'auth_failed') {
          return res.status(401).json(result);
        }
        if (result.status === 'not_found') {
          return res.status(404).json(result);
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error('[API] POST /api/memories/voice-update error:', error?.message || error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'Failed to process memory update',
      });
    }
  });

  // REST PUT /api/memories/:id endpoint
  app.put('/api/memories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = resolveUserIdFromRequest(req);
      const { newValue, content, value, codeword, pin } = req.body;
      const rawCodeword =
        codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const effectiveCodeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
      const effectivePin = pin || req.query?.pin || (req.headers['x-pin'] as string);
      const result = await executeMemoryUpdate(
        {
          userId,
          memoryId: id,
          newValue: newValue || content || value,
          codeword: effectiveCodeword,
          pin: effectivePin,
        },
        broadcastMemoryEvent
      );

      if (!result.success) {
        if (result.status === 'codeword_required') {
          return res.status(403).json(result);
        }
        if (result.status === 'auth_failed') {
          return res.status(401).json(result);
        }
        if (result.status === 'not_found') {
          return res.status(404).json(result);
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error('[API] PUT /api/memories/:id error:', error?.message || error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'Failed to update memory',
      });
    }
  });

  // Step 1: Memory Extraction Engine endpoint (read-only analysis by default; produces candidates, does NOT save to Firestore unless persist: true)
  app.post('/api/memories/extract', async (req, res) => {
    try {
      const { text, conversationHistory, persist } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Valid text is required to extract memory candidates',
        });
      }
      const result = await extractMemoryCandidates({
        text,
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
      });

      // Step 2 Controlled Persistence: Only if persist === true is explicitly requested
      let persistenceResult = undefined;
      if (persist === true && result.candidates.length > 0) {
        const userId = resolveUserIdFromRequest(req);
        persistenceResult = await persistMemoryCandidates(result.candidates, userId);
      }

      res.json({
        success: true,
        ...result,
        ...(persistenceResult ? { persistence: persistenceResult } : {}),
      });
    } catch (error: any) {
      console.error('[API] POST /api/memories/extract error:', error?.message || error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to extract memory candidates',
      });
    }
  });

  // Step 2: Dedicated controlled memory persistence test endpoint
  app.post('/api/memories/persist', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { text, candidates, conversationHistory } = req.body;

      let candidatesToPersist = [];

      if (Array.isArray(candidates)) {
        candidatesToPersist = candidates;
      } else if (text && typeof text === 'string' && text.trim()) {
        const extraction = await extractMemoryCandidates({
          text,
          conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : undefined,
        });
        candidatesToPersist = extraction.candidates;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either text string or candidates array is required',
        });
      }

      const persistence = await persistMemoryCandidates(candidatesToPersist, userId);
      res.json({
        success: true,
        persistedCount: persistence.persistedCount,
        duplicateCount: persistence.duplicateCount,
        rejectedCount: persistence.rejectedCount,
        results: persistence.results,
        persistence,
      });
    } catch (error: any) {
      console.error('[API] POST /api/memories/persist error:', error?.message || error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to persist memory candidates',
      });
    }
  });

  // Step 3: Live conversation turn memory bridge endpoint
  app.post('/api/memories/live-turn', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Text string is required for completed user turn',
        });
      }

      const result = await liveMemoryBridge.handleCompletedUserTurn(text, userId, undefined, sessionId);
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[API] POST /api/memories/live-turn error:', error?.message || error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to process live conversation turn',
      });
    }
  });

  // --- MEMORY SECURITY FOUNDATION ENDPOINTS (STEP 2) ---

  // 1. Get current security status (sanitized: NEVER returns secrets or hashes)
  app.get('/api/memory-security/status', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const config = await getSecurityConfig(userId, sessionId);
      res.json({
        success: true,
        status: getSanitizedSecurityStatus(config),
      });
    } catch (error: any) {
      console.error('[API] GET /api/memory-security/status error:', error?.message || error);
      res.status(500).json({ success: false, error: 'Failed to retrieve security status' });
    }
  });

  // 1b. Initialize security for a new application session (guarantees ON)
  app.post('/api/memory-security/init-session', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const status = await initializeSecurityForNewSession(userId, sessionId);
      resetAutomaticMemorySavingSession(sessionId);
      broadcastMemoryEvent({ type: 'securityChanged', enabled: true, status, sessionId, isInit: true });
      res.json({ success: true, status, automaticMemorySaving: true });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/init-session error:', error?.message || error);
      res.status(500).json({ success: false, error: 'Failed to initialize session security' });
    }
  });

  // 1c. Automatic Memory Saving Master Switch status (session-level)
  app.get('/api/memory/automatic-saving', (req, res) => {
    try {
      const sessionId = resolveSessionIdFromRequest(req);
      const enabled = isAutomaticMemorySavingEnabled(sessionId);
      res.json({ success: true, automaticMemorySaving: enabled });
    } catch (error: any) {
      console.error('[API] GET /api/memory/automatic-saving error:', error?.message || error);
      res.status(500).json({ success: false, error: 'Failed to get automatic memory saving status' });
    }
  });

  // 1d. Toggle Automatic Memory Saving Master Switch (session-level)
  app.post('/api/memory/automatic-saving', (req, res) => {
    try {
      const sessionId = resolveSessionIdFromRequest(req);
      const enabled = req.body?.enabled !== false && req.body?.action !== 'disable' && req.body?.action !== 'off';
      setAutomaticMemorySaving(enabled, sessionId);
      const message = enabled ? 'Memory saving on kar di hai.' : 'Memory saving band kar di hai.';
      broadcastMemoryEvent({ type: 'automaticMemorySavingChanged', enabled, message, sessionId });
      res.json({ success: true, automaticMemorySaving: enabled, message });
    } catch (error: any) {
      console.error('[API] POST /api/memory/automatic-saving error:', error?.message || error);
      res.status(500).json({ success: false, error: 'Failed to update automatic memory saving' });
    }
  });

  // 1e. Initialize/Reset Automatic Memory Saving for a new session (silent reset to ON)
  app.post('/api/memory/init-session', (req, res) => {
    try {
      const sessionId = resolveSessionIdFromRequest(req);
      resetAutomaticMemorySavingSession(sessionId);
      res.json({ success: true, automaticMemorySaving: true });
    } catch (error: any) {
      console.error('[API] POST /api/memory/init-session error:', error?.message || error);
      res.status(500).json({ success: false, error: 'Failed to reset memory saving session' });
    }
  });

  // 2. Initial PIN Setup (first time only)
  app.post('/api/memory-security/setup-pin', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { pin, confirmPin } = req.body;
      const status = await setupInitialPin(userId, pin, confirmPin);
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/setup-pin error:', error?.message || error);
      res.status(error?.statusCode || 400).json({
        success: false,
        error: error?.message || 'Failed to setup PIN',
      });
    }
  });

  // 3. Initial Codeword Setup (first time only)
  app.post('/api/memory-security/setup-codeword', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { codeword, confirmCodeword } = req.body;
      const status = await setupInitialCodeword(userId, codeword, confirmCodeword);
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/setup-codeword error:', error?.message || error);
      res.status(error?.statusCode || 400).json({
        success: false,
        error: error?.message || 'Failed to setup codeword',
      });
    }
  });

  // 4. Change PIN (requires verification of current PIN)
  app.post('/api/memory-security/change-pin', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { currentPin, newPin, confirmNewPin } = req.body;
      const status = await changePin(userId, currentPin, newPin, confirmNewPin);
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/change-pin error:', error?.message || error);
      res.status(error?.statusCode || 400).json({
        success: false,
        error: error?.message || 'Failed to change PIN',
      });
    }
  });

  // 5. Change Codeword (FIX 1: requires verification of current PIN ONLY)
  app.post('/api/memory-security/change-codeword', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { currentPin, currentCodeword, newCodeword, confirmNewCodeword } = req.body;
      const status = await changeCodeword(userId, {
        currentPin,
        currentCodeword,
        newCodeword,
        confirmNewCodeword,
      });
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/change-codeword error:', error?.message || error);
      res.status(error?.statusCode || 400).json({
        success: false,
        error: error?.message || 'Failed to change codeword',
      });
    }
  });

  // 6. Turn Security ON / OFF (FIX 3: ON requires no credential; OFF strictly requires Codeword ONLY)
  app.post('/api/memory-security/toggle', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const { enabled, pin, codeword } = req.body;
      const rawCodeword =
        codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const effectiveCodeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
      const status = await toggleSecurity(userId, Boolean(enabled), { pin, codeword: effectiveCodeword }, sessionId);
      broadcastMemoryEvent({ type: 'securityChanged', enabled: Boolean(enabled), status, sessionId });
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/toggle error:', error?.message || error);
      const isCodewordReq = error?.code === 'CODEWORD_REQUIRED_TO_DISABLE';
      const isAuthFailed = error?.code === 'INVALID_CODEWORD';
      res.status(error?.statusCode || (isCodewordReq ? 403 : (isAuthFailed ? 401 : 400))).json({
        success: false,
        status: isCodewordReq ? 'codeword_required' : (isAuthFailed ? 'auth_failed' : 'error'),
        requiresCodeword: isCodewordReq,
        error: error?.message || 'Failed to toggle security state',
      });
    }
  });

  // 6b. Voice / Natural Language Security Toggle endpoint
  app.post('/api/memory-security/voice-toggle', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const sessionId = resolveSessionIdFromRequest(req);
      const { action, codeword, pin, rawText } = req.body;
      const rawCodeword =
        codeword ||
        req.query?.codeword ||
        (req.headers['x-codeword'] as string) ||
        (req.headers['x-security-codeword'] as string);
      const effectiveCodeword = isBlankOrPlaceholderCodeword(rawCodeword) ? undefined : String(rawCodeword).trim();
      const result = await executeVoiceToggleSecurity(
        {
          userId,
          action: action === 'enable' || action === 'on' ? 'enable' : 'disable',
          codeword: effectiveCodeword,
          pin,
          rawText,
          sessionId,
        },
        broadcastMemoryEvent
      );
      if (!result.success) {
        if (result.status === 'codeword_required') {
          return res.status(403).json(result);
        }
        if (result.status === 'auth_failed') {
          return res.status(401).json(result);
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/voice-toggle error:', error?.message || error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'Failed to process voice security toggle',
      });
    }
  });

  // 7. Verify credentials (PIN or Codeword)
  app.post('/api/memory-security/verify', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const { pin, codeword } = req.body;
      const result = await verifySecurityCredentials(userId, { pin, codeword });
      res.json(result);
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/verify error:', error?.message || error);
      res.status(error?.statusCode || 400).json({
        success: false,
        error: error?.message || 'Verification failed',
      });
    }
  });

  // 8. Reset security credentials to clean first-time setup state
  app.post('/api/memory-security/reset', async (req, res) => {
    try {
      const userId = resolveUserIdFromRequest(req);
      const status = await resetSecurityCredentials(userId);
      res.json({ success: true, status });
    } catch (error: any) {
      console.error('[API] POST /api/memory-security/reset error:', error?.message || error);
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to reset security credentials',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      model: 'gemini-3.1-flash-live-preview',
      firestoreConfigured: isFirestoreAvailable(),
      targetDatabaseId: TARGET_FIRESTORE_DATABASE_ID,
      targetProjectId: TARGET_FIREBASE_PROJECT_ID,
      memoryHealth: getMemoryStoreHealth(),
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

  broadcastMemoryEvent = (event: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(event));
        } catch {}
      }
    });
  };

  liveMemoryBridge.setBroadcaster((event) => {
    broadcastMemoryEvent(event);
  });

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

  wss.on('connection', async (clientWs: WebSocket, request: http.IncomingMessage) => {
    let wsSessionId: string | undefined = undefined;
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      wsSessionId = url.searchParams.get('sessionId') || (request.headers['x-session-id'] as string) || undefined;
    } catch {}

    console.log(`[Live Gateway] Client connected to live audio socket (session: ${wsSessionId || 'default'})`);

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
    let userSpeechTurnBuffer = '';

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

      let existingMemories: any[] = [];
      try {
        existingMemories = await getMemories(DEFAULT_USER_ID);
        console.log(`[Live Gateway] Injected ${existingMemories.length} permanent memories into Mahiru's conversation context.`);
      } catch (memErr: any) {
        console.log('[Live Gateway] Defaulting to standard memory context:', memErr?.message || memErr);
      }
      const memoriesSummary = existingMemories.length > 0
        ? `\n\nPERMANENT MEMORIES ABOUT USER (STORED IN CLOUD FIRESTORE):\n` +
          existingMemories.map((m: any) => `- [ID: ${m.id}] [Category: ${m.category || 'PREFERENCE'}] [Key: ${m.key || 'fact'}] Value: ${m.value || m.content}`).join('\n')
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
- MEMORY DELETION & MANAGEMENT RULES (CRITICAL):
  - When the user asks to delete, remove, or forget a memory (e.g., "mera favourite color wali memory delete karo", "memory se ise delete karo", "black color wali memory delete karo", "delete my favorite food", "forget that I like anime"):
    You MUST call the tool 'deletePermanentMemory' with the relevant 'memoryId' (from your stored memory list above) or 'query' (the memory key/topic/value).
    NEVER claim "delete kar diya", "maine bhool diya", or "okay, delete ho gaya" without calling 'deletePermanentMemory' and verifying the tool returned success.
    If multiple memories match the user's request and you cannot tell which one they mean (e.g., user says "favorite wali memory delete karo" when both favorite color and favorite anime exist):
      DO NOT GUESS. Ask the user for clarification before deleting (e.g., "Kaunsi memory delete karun? Favourite color wali ya favourite anime wali?").
    If 'deletePermanentMemory' returns status 'codeword_required' (meaning Security is ON):
      Ask the user to speak their secret Codeword to authorize the deletion: "Security ON hai, please memory delete karne ke liye apna secret Codeword bataiye."
      When the user provides their Codeword, call 'deletePermanentMemory' again including the 'codeword' argument.
    If 'deletePermanentMemory' returns status 'auth_failed':
      Inform the user that the Codeword was incorrect and the memory was NOT deleted. NEVER claim that the delete succeeded.
    If 'deletePermanentMemory' returns status 'ambiguous':
      Ask the clarification question returned by the tool before deleting anything.
    If 'deletePermanentMemory' returns status 'deleted':
      Confirm warmly and naturally: "Okay, maine memory delete kar di."
    If 'deletePermanentMemory' returns status 'not_found' or failure:
      Honestly inform the user that the memory was not found or could not be deleted from the database.
  - DELETE ALL MEMORIES (MANDATORY CODEWORD ALWAYS):
    If the user asks to delete, clear, or wipe all memories (e.g., "delete all memories", "sari memory delete kar do", "saari permanent memories hata do", "delete all permanent memories"):
      You MUST call the tool 'deletePermanentMemory' with query: 'all'.
      Deleting ALL permanent memories ALWAYS strictly requires Secret Codeword verification, regardless of Security ON or Security OFF.
      If 'deletePermanentMemory' returns status 'codeword_required':
        Ask the user to speak their secret Codeword: "Saari permanent memories delete karne ke liye please apna secret Codeword bataiye."
        When the user provides their Codeword, call 'deletePermanentMemory' again with query: 'all' and codeword: '<user codeword>'.
      If 'deletePermanentMemory' returns status 'auth_failed':
        Inform the user that the Codeword was incorrect and no memories were deleted: "Codeword galat hai, isliye saari memories delete nahi hui."
      If 'deletePermanentMemory' returns status 'deleted':
        Confirm warmly: "Saari permanent memories delete kar di gayi hain."
  - OWNER NAME DELETION (MANDATORY CODEWORD ALWAYS):
    If the user asks to delete or remove their stored owner name (e.g., "mera naam memory se delete karo", "mera naam hata do", "owner name delete karo"):
      You MUST call the tool 'deletePermanentMemory' with query: 'name'.
      Deleting the owner name ALWAYS strictly requires Secret Codeword verification, regardless of Security ON or Security OFF.
      If 'deletePermanentMemory' returns status 'codeword_required':
        Ask the user to speak their secret Codeword: "Apna naam delete karne ke liye please apna secret Codeword bataiye."
      If 'deletePermanentMemory' returns status 'auth_failed':
        Inform the user that the Codeword was incorrect and your name was NOT deleted.
- MEMORY UPDATE & OWNER IDENTITY RULES (CRITICAL):
  - When the user asks to change or update an existing permanent memory (e.g., "mera favourite color ab Blue hai", "favourite color Black se Blue kar do", "mera favourite anime ab Solo Leveling hai", "change my favorite color to Blue"):
    Treat this as an UPDATE of an existing memory, NOT a new memory.
    Call the tool 'updatePermanentMemory' with the relevant 'query' or 'memoryId', and 'newValue'.
    If the tool returns status 'codeword_required':
      Ask the user to speak their secret Codeword to authorize the update: "Memory update karne ke liye please apna secret Codeword bataiye."
      When the user provides their Codeword, call 'updatePermanentMemory' again including the 'codeword' argument.
    If the tool returns status 'auth_failed':
      Inform the user that the Codeword was incorrect and the memory was NOT changed. NEVER claim that the update succeeded.
    If the tool returns status 'ambiguous':
      Ask the clarification question returned by the tool before modifying anything.
    If the tool returns status 'updated':
      Confirm warmly and naturally that the memory has been updated in the database.
    NEVER claim that a memory was changed unless 'updatePermanentMemory' returns success: true!
  - OWNER NAME CHANGE (MANDATORY CODEWORD ALWAYS):
    If the user asks to change their own stored name (e.g. "Ab mera naam Rahul hai", "change my name to Rahul", "mera naam badal kar Rahul kar do"):
      You MUST call 'updatePermanentMemory' with query: 'name' and newValue: 'Rahul'.
      Changing the owner name ALWAYS requires Secret Codeword verification, regardless of Security ON or Security OFF.
      If 'updatePermanentMemory' returns status 'codeword_required':
        Ask the user to speak their secret Codeword: "Apna naam change karne ke liye please apna secret Codeword bataiye."
      If 'updatePermanentMemory' returns status 'auth_failed':
        Inform the user that the Codeword was incorrect and their name was NOT changed. Keep their existing owner name.
      If 'updatePermanentMemory' returns status 'updated':
        Confirm warmly and naturally call the user by their new name.
    If another person or third party introduces themselves (e.g., "Mera naam Sumit hai"):
      This is a normal person/guest introduction, NOT an owner name change. Do NOT challenge for the owner's codeword. Acknowledge them warmly.
- MEMORY CREATION, EXACT DUPLICATE & SIMILAR MEMORY RULES (CRITICAL):
  - EXACT DUPLICATE RULE:
    Before acknowledging or confirming any new memory, check your PERMANENT MEMORIES list above.
    An EXACT duplicate means an existing memory represents the same semantic category, the same semantic key, and the same normalized factual value (e.g. existing memory has category watching_entertainment / key favorite_anime / value Solo Leveling, and user says "Mujhe Solo Leveling pasand hai" or "New memory mein save karo: mujhe Solo Leveling pasand hai").
    When an exact duplicate is detected:
    - DO NOT claim that a new memory was created.
    - Respond naturally: "Ye memory pehle se saved hai."
    - The phrase "new memory" does NOT bypass exact duplicate protection! Even if user explicitly says "New memory mein save karo: mujhe Solo Leveling pasand hai", if it already exists, respond: "Ye memory pehle se saved hai."
  - INDEPENDENT MULTI-VALUE ITEMS (e.g. Naruto, Jujutsu Kaisen, Pizza, Coffee):
    If the user shares an independent additional favorite under the same category or key (e.g. existing memory: Solo Leveling; user says: "Mujhe Naruto bhi pasand hai", or existing: Biryani; user: "Mujhe Pizza bhi pasand hai"):
    - This is an independent new favorite.
    - Save it as a separate memory in Cloud Firestore without overwriting existing memories.
    - Acknowledge warmly that you remembered this new favorite as well.
    - DO NOT ask "Update or new?" for independent favorites.
  - SIMILAR / REFINEMENT / RELATED PREFERENCES (e.g. "love story wale anime" when Solo Leveling exists):
    If the user's statement is a refinement, subgenre, qualified style, or semantically related modification rather than an independent title (e.g. "Mujhe love story wale anime pasand hain" when Solo Leveling exists):
    - DO NOT automatically save it.
    - DO NOT overwrite the existing memory.
    - Ask the user to choose:
      "Ye existing anime preference se related hai. Kya aap existing memory update karna chahte hain, ya ise alag new memory ke roop mein save karna hai?"
  - EXPLICIT NEW MEMORY DIRECTIVE & SAVING CONFIRMATION (CRITICAL):
    When the user explicitly asks to save a memory (e.g. "New memory mein save karo...", "Isko new memory mein save karo", "Save this as a new memory", "Mera favorite anime Naruto hai ise memory mein save karo", "Isko permanent memory mein save kar lo"):
    - You MUST call the tool 'savePermanentMemory' with the fact to save!
    - NEVER claim or say "Maine save kar liya", "Yaad rakh liya", or "New memory save ho gayi" BEFORE calling 'savePermanentMemory' or if the tool fails!
    - Only report success AFTER 'savePermanentMemory' returns confirmed success (status: 'saved', success: true).
    - If 'savePermanentMemory' returns status 'duplicate':
      Respond naturally: "Ye memory pehle se saved hai."
    - If 'savePermanentMemory' returns status 'similar_requires_decision':
      Ask the clarification question returned by the tool.
    - If 'savePermanentMemory' returns status 'error' or fails:
      Inform the user honestly: "Memory Firestore database mein save nahi ho saki."
    - If it is GENUINELY DIFFERENT information (e.g. existing memory: Chinese drama or Korean drama; user says: "New memory mein save karo ki mujhe Indian South love story wali movies dekhna pasand hai"):
      CREATE a new separate memory. Do NOT reject it merely because the category is the same or another memory exists under that category. The actual factual value is different!
    - Do NOT ask "Update karna hai ya new memory?" because the user already explicitly requested a new memory!
  - DO NOT OVER-BLOCK NEW MEMORIES:
    Do NOT treat different factual preferences as duplicates or similarities:
    Existing: Chinese drama, Korean drama -> New: Indian South love story movies -> CREATE NEW MEMORY.
    Existing: Solo Leveling -> New: Naruto -> CREATE NEW MEMORY.
    Existing: Biryani -> New: Pizza -> CREATE NEW MEMORY.
    Existing: Chai -> New: Coffee -> CREATE NEW MEMORY.
- AUTOMATIC MEMORY SAVING ON/OFF RULES (SEPARATE MASTER SWITCH):
  - When the user asks to turn OFF or pause automatic memory saving (e.g. "Memory saving band karo", "Memory saving off karo", "Automatic memory saving band kar do", "Ab jo bhi baat karenge use memory mein save mat karna", "Don't save our conversation to memory"):
    You MUST call the tool 'setAutomaticMemorySaving' with enabled: false.
    Confirm concisely: "Memory saving band kar di hai."
    Do NOT ask for any Codeword or PIN (this is completely separate from memory security).
  - When the user asks to turn ON or resume automatic memory saving (e.g. "Memory saving on karo", "Memory saving chalu karo", "Automatic memory saving on kar do", "Start saving memories again"):
    You MUST call the tool 'setAutomaticMemorySaving' with enabled: true.
    Confirm concisely: "Memory saving on kar di hai."
  - When automatic memory saving is OFF, normal conversation must NOT be automatically saved.
    HOWEVER, if the user explicitly asks to save a memory (e.g. "Isko memory mein save karo", "Ye memory save kar do", "Is information ko permanent memory mein save karo", "Waise memory saving off hai, lekin mera favorite movie Interstellar hai, ise memory mein save karo"):
    You MUST save that explicitly requested memory! The OFF state only pauses automatic conversation saving.
- CREDENTIAL PROTECTION & SECRECY (CRITICAL):
  - NEVER reveal, repeat, guess, or output any security PIN, voice Codeword, or secret credentials under any circumstances.
  - If the user or anyone asks "What is my PIN?", "What is my Codeword?", "Tell me the secret code", "Mera PIN kya hai?", or "Mera codeword batao", respond affectionately but strictly: "Main aapka PIN ya secret codeword kabhi nahi bata sakti, yeh aapki private security ke liye hai!"
  - You do NOT have access to PINs or Codewords, and you must never claim to know them.
- MEMORY SECURITY VOICE CONTROL RULES (CRITICAL):
  - When the user asks to turn OFF or disable memory security (e.g. "Memory security ko band karo", "Memory security off karo", "Security band kar do", "Security ko off karo", "Turn memory security off", "Disable memory security"):
    You MUST call the tool 'setMemorySecurity' with action: 'disable' (and codeword if provided).
    NEVER turn security OFF on your own or claim it is OFF without the tool succeeding.
    If 'setMemorySecurity' returns status 'codeword_required':
      Ask the user sweetly and politely to provide their secret Codeword: "Memory security band karne ke liye please apna secret Codeword bataiye."
      When the user speaks their Codeword, call 'setMemorySecurity' again with action: 'disable' and codeword: '<user codeword>'.
    If 'setMemorySecurity' returns status 'auth_failed':
      Inform the user that the Codeword was incorrect and Security remains ON: "Codeword galat hai, isliye memory security band nahi hui aur security ON hi rahegi."
    If 'setMemorySecurity' returns status 'disabled':
      Confirm warmly: "Memory security successfully band ho gayi hai."
  - When the user asks to turn ON or enable memory security (e.g. "Memory security ko on karo", "Memory security on karo", "Security on kar do", "Security chalu karo", "Turn memory security on", "Enable memory security"):
    Call 'setMemorySecurity' with action: 'enable'.
    NO Codeword or PIN is required to turn security ON.
    When 'setMemorySecurity' returns status 'enabled':
      Confirm warmly: "Memory security successfully on ho gayi hai."
- Available interactive tools:
  - 'setMemorySecurity': Call this when user requests to turn memory security ON or OFF.
  - 'savePermanentMemory': Call this when user requests to save, remember, or store a memory in Cloud Firestore database.
  - 'updatePermanentMemory': Call this when user requests to update, change, or modify an existing stored memory.
  - 'deletePermanentMemory': Call this when user requests to delete, remove, or forget a stored memory.
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
                        description: "Color name or hex: 'blue', 'purple', 'pink', 'red', 'cyan', 'green', 'warm', 'cool', 'dim', 'bright', 'normal'",
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
                {
                  name: 'deletePermanentMemory',
                  description: 'Deletes a permanent memory about the user from Cloud Firestore database. Call this tool when the user asks to delete, forget, or remove a memory. If Security is ON, secret codeword is required.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      memoryId: {
                        type: Type.STRING,
                        description: 'The exact memory ID to delete if known from your stored memory list (e.g. mem_123456)',
                      },
                      query: {
                        type: Type.STRING,
                        description: 'The natural language keyword, key, topic, or value of the memory to delete (e.g. "favorite color", "favorite food", "black", "Naruto")',
                      },
                      codeword: {
                        type: Type.STRING,
                        description: 'The user voice codeword if Security is ON and provided by the user to authorize deletion',
                      },
                    },
                  },
                },
                {
                  name: 'updatePermanentMemory',
                  description: 'Updates an existing permanent memory about the user in Cloud Firestore database. Call when user wants to change an existing memory (e.g. "mera favourite color ab Blue hai", "favourite anime Solo Leveling kar do", "change favorite color to Blue") or change owner name (e.g. "ab mera naam Rahul hai"). Owner name change ALWAYS requires secret codeword (even if Security is OFF).',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      memoryId: {
                        type: Type.STRING,
                        description: 'The exact memory ID to update if known from your stored memory list (e.g. mem_123456)',
                      },
                      query: {
                        type: Type.STRING,
                        description: 'The topic or key of the memory to update (e.g. "name", "favorite color", "favorite anime", "favorite food")',
                      },
                      newValue: {
                        type: Type.STRING,
                        description: 'The new value to set for this memory (e.g. "Rahul", "Blue", "Solo Leveling")',
                      },
                      codeword: {
                        type: Type.STRING,
                        description: 'The user voice codeword if required and provided by the user',
                      },
                    },
                    required: ['newValue'],
                  },
                },
                {
                  name: 'setMemorySecurity',
                  description: 'Turns memory security ON or OFF. Turning security ON requires NO credentials and happens directly. Turning security OFF strictly requires the secret Codeword. If codeword is not yet provided, call this tool to initiate the security off request and ask the user for their codeword.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "'enable' to turn security ON, or 'disable' to turn security OFF",
                      },
                      codeword: {
                        type: Type.STRING,
                        description: 'The secret Codeword if turning security OFF',
                      },
                    },
                    required: ['action'],
                  },
                },
                {
                  name: 'setAutomaticMemorySaving',
                  description: 'Turns automatic memory saving from normal conversation ON or OFF. Call this when the user says "memory saving band karo", "memory saving off karo", "memory saving on karo", "memory saving chalu karo", "don\'t save our conversation to memory", etc. Note: this is completely separate from memory security and does NOT require a codeword.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      enabled: {
                        type: Type.BOOLEAN,
                        description: 'true to turn automatic memory saving ON, false to turn it OFF',
                      },
                    },
                    required: ['enabled'],
                  },
                },
                {
                  name: 'savePermanentMemory',
                  description: 'Saves a new permanent memory about the user directly into Cloud Firestore database. Call this tool when the user asks to save, remember, or record a new memory ("New memory mein save karo...", "Isko memory mein save karo", "Mera favorite anime Naruto hai ise memory mein save karo", "Save this in memory", "Isko yaad rakhna"). NEVER claim a memory is saved until this tool confirms success.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: {
                        type: Type.STRING,
                        description: 'The exact fact or preference to save (e.g. "Indian South love story wali movies dekhna pasand hai", "Solo Leveling", "pizza")',
                      },
                      category: {
                        type: Type.STRING,
                        description: 'Optional semantic category (e.g. watching_entertainment, food, drinks, gaming, personal_profile)',
                      },
                      key: {
                        type: Type.STRING,
                        description: 'Optional semantic key (e.g. favorite_movie, favorite_anime, favorite_food)',
                      },
                      isExplicitNew: {
                        type: Type.BOOLEAN,
                        description: 'true if the user explicitly commanded to save as a new memory (e.g. "new memory mein save karo")',
                      },
                    },
                    required: ['fact'],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
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

            // 3. User speech input transcription from Gemini Live (if model streams transcription)
            const inputTx = (message.serverContent as any)?.inputTranscription;
            if (inputTx?.text) {
              userSpeechTurnBuffer += (userSpeechTurnBuffer ? ' ' : '') + inputTx.text;
            }
            if (inputTx?.finished && userSpeechTurnBuffer.trim()) {
              const speechTurn = userSpeechTurnBuffer.trim();
              userSpeechTurnBuffer = '';
              liveMemoryBridge.handleCompletedUserTurn(speechTurn, DEFAULT_USER_ID, clientWs, wsSessionId).catch((err) => {
                console.error('[Live Gateway] Error extracting memory from live speech turn:', err);
              });
            }

            // 4. Turn completion
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
              if (userSpeechTurnBuffer.trim()) {
                const speechTurn = userSpeechTurnBuffer.trim();
                userSpeechTurnBuffer = '';
                liveMemoryBridge.handleCompletedUserTurn(speechTurn, DEFAULT_USER_ID, clientWs, wsSessionId).catch((err) => {
                  console.error('[Live Gateway] Error extracting memory on turnComplete:', err);
                });
              }
            }

            // 5. Function call (Server handles deletePermanentMemory directly; others forwarded to client)
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls || [];
              const serverResponses: any[] = [];
              const clientFunctionCalls: any[] = [];

              for (const fc of functionCalls) {
                if (fc.name === 'deletePermanentMemory') {
                  const callId = fc.id;
                  const args = (fc.args || {}) as any;
                  console.log('[Live Gateway] Executing deletePermanentMemory tool call:', args);
                  const cleanDeleteCodeword = isBlankOrPlaceholderCodeword(args.codeword) ? undefined : String(args.codeword).trim();
                  try {
                    const deleteResult = await executeVoiceDeleteMemory(
                      DEFAULT_USER_ID,
                      args.query,
                      args.memoryId,
                      broadcastMemoryEvent,
                      { codeword: cleanDeleteCodeword, sessionId: wsSessionId } as any
                    );
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: deleteResult,
                    });
                  } catch (delErr: any) {
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: {
                        success: false,
                        status: 'error',
                        error: delErr?.message || 'Database error occurred',
                        message: 'Firestore delete failed.',
                      },
                    });
                  }
                } else if (fc.name === 'updatePermanentMemory') {
                  const callId = fc.id;
                  const args = (fc.args || {}) as any;
                  console.log('[Live Gateway] Executing updatePermanentMemory tool call:', args);
                  const cleanUpdateCodeword = isBlankOrPlaceholderCodeword(args.codeword) ? undefined : String(args.codeword).trim();
                  try {
                    const updateResult = await executeMemoryUpdate(
                      {
                        userId: DEFAULT_USER_ID,
                        query: args.query,
                        memoryId: args.memoryId,
                        newValue: args.newValue,
                        codeword: cleanUpdateCodeword,
                        rawText: args.query,
                        sessionId: wsSessionId,
                      },
                      broadcastMemoryEvent
                    );
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: updateResult,
                    });
                  } catch (updErr: any) {
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: {
                        success: false,
                        status: 'error',
                        error: updErr?.message || 'Database error occurred',
                        message: 'Firestore update failed.',
                      },
                    });
                  }
                } else if (fc.name === 'setMemorySecurity') {
                  const callId = fc.id;
                  const args = (fc.args || {}) as any;
                  console.log('[Live Gateway] Executing setMemorySecurity tool call:', args);
                  const action = args.action === 'enable' || args.enabled === true ? 'enable' : 'disable';
                  const cleanCodeword = isBlankOrPlaceholderCodeword(args.codeword) ? undefined : String(args.codeword).trim();
                  try {
                    const toggleResult = await executeVoiceToggleSecurity(
                      {
                        userId: DEFAULT_USER_ID,
                        action,
                        codeword: cleanCodeword,
                        sessionId: wsSessionId,
                      },
                      broadcastMemoryEvent
                    );
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: toggleResult,
                    });
                  } catch (toggleErr: any) {
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: {
                        success: false,
                        status: 'error',
                        error: toggleErr?.message || 'Failed to toggle security',
                        message: 'Security toggle failed.',
                      },
                    });
                  }
                } else if (fc.name === 'setAutomaticMemorySaving') {
                  const callId = fc.id;
                  const args = (fc.args || {}) as any;
                  const enabled = args.enabled !== false && args.action !== 'disable' && args.action !== 'off';
                  setAutomaticMemorySaving(enabled, wsSessionId);
                  const msg = enabled ? 'Memory saving on kar di hai.' : 'Memory saving band kar di hai.';
                  console.log(`[Live Gateway] Executing setAutomaticMemorySaving tool call: enabled=${enabled}, sessionId=${wsSessionId}`);
                  serverResponses.push({
                    id: callId,
                    name: fc.name,
                    response: {
                      success: true,
                      enabled,
                      message: msg,
                    },
                  });
                  clientWs.send(
                    JSON.stringify({
                      type: 'automaticMemorySavingChanged',
                      enabled,
                      message: msg,
                      sessionId: wsSessionId,
                    })
                  );
                  broadcastMemoryEvent({
                    type: 'automaticMemorySavingChanged',
                    enabled,
                    message: msg,
                    sessionId: wsSessionId,
                  });
                } else if (fc.name === 'savePermanentMemory') {
                  const callId = fc.id;
                  const args = (fc.args || {}) as any;
                  console.log('[Live Gateway] Executing savePermanentMemory tool call:', args);
                  try {
                    const saveResult = await executeVoiceSaveMemory(
                      {
                        userId: DEFAULT_USER_ID,
                        fact: args.fact || '',
                        category: args.category,
                        key: args.key,
                        isExplicitNew: Boolean(args.isExplicitNew || (args.fact && isExplicitSaveCommand(args.fact))),
                        sessionId: wsSessionId,
                      },
                      broadcastMemoryEvent
                    );
                    liveMemoryBridge.markTurnHandled(args.fact || '');
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: saveResult,
                    });
                  } catch (saveErr: any) {
                    serverResponses.push({
                      id: callId,
                      name: fc.name,
                      response: {
                        success: false,
                        status: 'error',
                        error: saveErr?.message || 'Database error occurred',
                        message: 'Firestore write failed.',
                      },
                    });
                  }
                } else {
                  clientFunctionCalls.push(fc);
                }
              }

              // Send responses for server-handled tools back to Gemini Live
              if (serverResponses.length > 0 && liveSession) {
                console.log('[Live Gateway] Sending server toolResponse back to Gemini:', serverResponses);
                liveSession.sendToolResponse({
                  functionResponses: serverResponses,
                });
              }

              // Forward remaining client-side tools (visual reactions, movements, etc.)
              if (clientFunctionCalls.length > 0) {
                clientWs.send(
                  JSON.stringify({
                    type: 'toolCall',
                    toolCall: {
                      functionCalls: clientFunctionCalls,
                    },
                  })
                );
              }
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
            // Forward 16kHz PCM audio chunk to Gemini (strictly audio forwarding, never memory extraction)
            liveSession.sendRealtimeInput({
              audio: {
                data: payload.data,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (payload.type === 'text' && payload.text) {
            const isSensitiveText = containsSensitiveCredentials(String(payload.text));
            console.log('[Live Gateway] Forwarding text prompt to Gemini Live:', isSensitiveText ? '[REDACTED CREDENTIAL]' : payload.text);
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: String(payload.text) }],
                },
              ],
              turnComplete: true,
            });

            // Asynchronously process completed user text turn for memory extraction & persistence
            liveMemoryBridge.handleCompletedUserTurn(String(payload.text), DEFAULT_USER_ID, clientWs, wsSessionId).catch((err) => {
              console.error('[Live Gateway] Error in live memory bridge for text turn:', err);
            });
          } else if ((payload.type === 'userTurn' || payload.type === 'userSpeechTurn') && payload.text) {
            const isSensitiveSpeech = containsSensitiveCredentials(String(payload.text));
            console.log('[Live Gateway] Received finalized user speech turn from client:', isSensitiveSpeech ? '[REDACTED CREDENTIAL]' : payload.text);
            liveMemoryBridge.handleCompletedUserTurn(String(payload.text), DEFAULT_USER_ID, clientWs, wsSessionId).catch((err) => {
              console.error('[Live Gateway] Error in live memory bridge for user speech turn:', err);
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

  server.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Mahiru Server] Running on http://localhost:${PORT}`);
    try {
      await initializeSecurityForNewSession(DEFAULT_USER_ID);
      console.log('[Mahiru Server] Authoritative Security state initialized as ON for application startup');
    } catch (initErr) {
      console.warn('[Mahiru Server] Security initialization warning on boot:', initErr);
    }
  });
}

startServer();
