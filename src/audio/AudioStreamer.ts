/**
 * AudioStreamer manages real-time bidirectional audio:
 * 1. Microphone capture -> downsampled 16kHz PCM16 -> Base64
 * 2. Incoming 24kHz PCM16 Base64 -> Web Audio API AudioBuffer playback
 * 3. Immediate interruption handling & real-time waveform analysis
 */

export class AudioStreamer {
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;

  private outputAnalyser: AnalyserNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime: number = 0;
  private isMuted: boolean = false;
  private micAvailable: boolean = false;

  // 100ms accumulator buffer: 1600 samples at 16kHz (3200 bytes raw PCM16)
  private pcmChunkBuffer: Int16Array = new Int16Array(1600);
  private pcmChunkBufferOffset: number = 0;

  private onAudioChunkCallback: ((base64Chunk: string) => void) | null = null;
  private animFrameId: number | null = null;
  private visualizerCallback: ((userVol: number, aiVol: number, freqs: Uint8Array) => void) | null = null;

  constructor(
    onAudioChunk: (base64Chunk: string) => void,
    onVisualizerUpdate?: (userVol: number, aiVol: number, freqs: Uint8Array) => void
  ) {
    this.onAudioChunkCallback = onAudioChunk;
    this.visualizerCallback = onVisualizerUpdate || null;
  }

  public isMicrophoneAvailable(): boolean {
    return this.micAvailable;
  }

  public async initMicrophone(): Promise<boolean> {
    if (this.micAvailable && this.micStream && this.scriptProcessor) {
      if (this.inputAudioCtx && this.inputAudioCtx.state === 'suspended') {
        try {
          await this.inputAudioCtx.resume();
        } catch {}
      }
      return true;
    }

    if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error(
        'Microphone API (getUserMedia) is not available in this browser or frame context. Please open in a full tab.'
      );
      err.name = 'NotSupportedError';
      throw err;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (primaryErr: any) {
      if (
        primaryErr.name === 'OverconstrainedError' ||
        primaryErr.name === 'ConstraintNotSatisfiedError' ||
        primaryErr.name === 'TypeError'
      ) {
        console.log('[AudioStreamer] Advanced constraints fallback to basic audio:', primaryErr?.message || primaryErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        throw primaryErr;
      }
    }

    this.micStream = stream;

    // Ensure input AudioContext is instantiated and active
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.inputAudioCtx) {
      this.inputAudioCtx = new AudioContextClass();
    }
    if (this.inputAudioCtx.state === 'suspended') {
      try {
        await this.inputAudioCtx.resume();
      } catch (err) {
        console.log('[AudioStreamer] inputAudioCtx resume notice:', err);
      }
    }

    this.inputAnalyser = this.inputAudioCtx.createAnalyser();
    this.inputAnalyser.fftSize = 64;

    this.micSource = this.inputAudioCtx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.inputAnalyser);

    const bufferSize = 2048;
    this.scriptProcessor = this.inputAudioCtx.createScriptProcessor(bufferSize, 1, 1);

    // Retain global reference to avoid Chromium GC bug (#82795) unhooking onaudioprocess
    try {
      (window as any).__mahiru_audio_processor = this.scriptProcessor;
    } catch {}

    // Reset 100ms accumulator buffer
    this.pcmChunkBufferOffset = 0;

    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (this.isMuted) return;

      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      const inputSampleRate = inputBuffer.sampleRate;

      // Downsample input to 16000 Hz if needed
      const downsampled = this.downsampleTo16kHz(inputData, inputSampleRate, 16000);

      // Convert Float32 [-1, 1] to Int16 PCM little endian
      const pcm16 = this.floatTo16BitPCM(downsampled);

      // Accumulate into 100ms (1600 samples) chunk buffer for clean Gemini Live VAD framing
      for (let i = 0; i < pcm16.length; i++) {
        this.pcmChunkBuffer[this.pcmChunkBufferOffset++] = pcm16[i];
        if (this.pcmChunkBufferOffset >= this.pcmChunkBuffer.length) {
          const base64Audio = this.arrayBufferToBase64(this.pcmChunkBuffer.buffer);
          if (this.onAudioChunkCallback && base64Audio) {
            this.onAudioChunkCallback(base64Audio);
          }
          this.pcmChunkBufferOffset = 0;
        }
      }
    };

    // Connect processor to destination (silent feedback loop required for script processor to fire)
    // Retain silentGain as an instance property to prevent V8 garbage-collection from severing destination
    this.silentGain = this.inputAudioCtx.createGain();
    this.silentGain.gain.value = 0;
    this.micSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(this.inputAudioCtx.destination);

    this.micAvailable = true;
    return true;
  }

  public async start(): Promise<{ micAvailable: boolean; micError?: string }> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

    // 1. Initialize input AudioContext synchronously during user gesture
    if (!this.inputAudioCtx) {
      this.inputAudioCtx = new AudioContextClass();
    }
    if (this.inputAudioCtx.state === 'suspended') {
      try {
        await this.inputAudioCtx.resume();
      } catch (err) {
        console.log('[AudioStreamer] Synchronous inputAudioCtx resume notice:', err);
      }
    }

    // 2. Initialize output AudioContext (24kHz for Gemini Live model output)
    try {
      this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });
    } catch {
      // Fallback for browsers (e.g. mobile Safari) that restrict custom sample rates
      this.outputAudioCtx = new AudioContextClass();
    }

    if (this.outputAudioCtx.state === 'suspended') {
      try {
        await this.outputAudioCtx.resume();
      } catch (err) {
        console.log('[AudioStreamer] outputAudioCtx resume notice:', err);
      }
    }

    this.outputAnalyser = this.outputAudioCtx.createAnalyser();
    this.outputAnalyser.fftSize = 64;
    this.outputAnalyser.connect(this.outputAudioCtx.destination);
    this.nextPlayTime = this.outputAudioCtx.currentTime;

    // 3. Attempt microphone access (graceful non-fatal fallback if blocked or restricted)
    let micErrorMsg: string | undefined;
    try {
      await this.initMicrophone();
    } catch (err: any) {
      // Graceful fallback: log informatively without triggering an intrusive warning badge in log viewer
      console.log('[AudioStreamer] Microphone not granted on initial connect, proceeding in voice-output mode:', err?.message || err);
      this.micAvailable = false;
      micErrorMsg = err?.message || 'Permission denied';
    }

    // 4. Start visualizer loop
    this.startVisualizerLoop();

    return {
      micAvailable: this.micAvailable,
      micError: micErrorMsg,
    };
  }

  /**
   * Manually request microphone on direct user gesture (e.g. tapping the mic button)
   */
  public async requestMicrophone(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.initMicrophone();
      return { success: true };
    } catch (err: any) {
      this.micAvailable = false;
      return { success: false, error: err?.message || 'Permission denied' };
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play an incoming 24kHz PCM16 chunk from Gemini Live
   */
  public playChunk(base64Data: string): void {
    if (!this.outputAudioCtx || !this.outputAnalyser) return;

    try {
      const pcmBytes = this.base64ToArrayBuffer(base64Data);
      const int16View = new Int16Array(pcmBytes);

      if (int16View.length === 0) return;

      // Convert Int16 to Float32
      const float32Data = new Float32Array(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        float32Data[i] = int16View[i] / 32768.0;
      }

      // Create AudioBuffer at 24000 Hz
      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.copyToChannel(float32Data, 0);

      const sourceNode = this.outputAudioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(this.outputAnalyser);

      const currentTime = this.outputAudioCtx.currentTime;
      const scheduledTime = Math.max(currentTime, this.nextPlayTime);
      sourceNode.start(scheduledTime);

      this.nextPlayTime = scheduledTime + audioBuffer.duration;
      this.activeSources.push(sourceNode);

      sourceNode.onended = () => {
        const index = this.activeSources.indexOf(sourceNode);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
      };
    } catch (err) {
      console.warn('[AudioStreamer] Notice playing chunk:', err);
    }
  }

  /**
   * Stop all active playback sources immediately when user interrupts
   */
  public interrupt(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
    if (this.outputAudioCtx) {
      this.nextPlayTime = this.outputAudioCtx.currentTime;
    }
  }

  public isPlaying(): boolean {
    return this.activeSources.length > 0;
  }

  /**
   * Resample Float32 array from inputSampleRate to 16000 Hz
   */
  private downsampleTo16kHz(buffer: Float32Array, inputRate: number, targetRate: number = 16000): Float32Array {
    if (inputRate === targetRate) {
      return buffer;
    }
    const sampleRatio = inputRate / targetRate;
    const newLength = Math.round(buffer.length / sampleRatio);
    const result = new Float32Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private startVisualizerLoop(): void {
    const freqData = new Uint8Array(32);

    const update = () => {
      let userVol = 0;
      let aiVol = 0;

      if (this.inputAnalyser && !this.isMuted) {
        const timeDomain = new Uint8Array(this.inputAnalyser.fftSize);
        this.inputAnalyser.getByteTimeDomainData(timeDomain);
        let sumSquares = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const norm = (timeDomain[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        userVol = Math.min(1, Math.sqrt(sumSquares / timeDomain.length) * 4);
      }

      if (this.outputAnalyser && this.activeSources.length > 0) {
        const timeDomain = new Uint8Array(this.outputAnalyser.fftSize);
        this.outputAnalyser.getByteTimeDomainData(timeDomain);
        let sumSquares = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const norm = (timeDomain[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        aiVol = Math.min(1, Math.sqrt(sumSquares / timeDomain.length) * 3);
        this.outputAnalyser.getByteFrequencyData(freqData);
      } else {
        freqData.fill(0);
      }

      if (this.visualizerCallback) {
        this.visualizerCallback(userVol, aiVol, freqData);
      }

      this.animFrameId = requestAnimationFrame(update);
    };

    this.animFrameId = requestAnimationFrame(update);
  }

  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.interrupt();

    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {}
      this.silentGain = null;
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
      } catch {}
      this.scriptProcessor = null;
    }

    try {
      delete (window as any).__mahiru_audio_processor;
    } catch {}

    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.inputAudioCtx) {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }
  }
}
