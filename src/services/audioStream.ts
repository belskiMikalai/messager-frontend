const SAMPLE_RATE = 24000;
const CHANNELS = 1;

export interface AudioStreamState {
  isStreaming: boolean;
  isMuted: boolean;
}

type AudioEventHandler = (event: string, data?: unknown) => void;

class AudioStreamingService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private onEvent: AudioEventHandler | null = null;
  private isStreaming = false;
  private isMuted = false;
  private wsSendCallback: ((data: ArrayBuffer) => void) | null = null;

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  playReceivedAudio(base64Data: string) {
    if (this.isMuted) return;

    try {
      const buffer = this.base64ToArrayBuffer(base64Data);
      this.playAudioChunk(buffer);
    } catch (e) {
      console.error("Failed to play received audio:", e);
    }
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private playAudioChunk(chunk: ArrayBuffer) {
    if (this.isMuted) return;

    try {
      const floatData = this.pcmToFloat32(chunk);
      
      // Play immediately with minimal buffering for low latency
      this.playImmediate(floatData);
    } catch (e) {
      console.error("Failed to play audio chunk:", e);
    }
  }

  private pcmToFloat32(pcmBuffer: ArrayBuffer): Float32Array {
    const pcmData = new Int16Array(pcmBuffer);
    const floatData = new Float32Array(pcmData.length);
    
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768;
    }
    
    return floatData;
  }

  private playImmediate(floatData: Float32Array) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const buffer = this.audioContext.createBuffer(
      CHANNELS,
      floatData.length,
      SAMPLE_RATE
    );
    const channelData = buffer.getChannelData(0);
    channelData.set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  async startStreaming(onEvent: AudioEventHandler, sendCallback: (data: ArrayBuffer) => void): Promise<boolean> {
    if (this.isStreaming) {
      console.warn("Already streaming audio");
      return false;
    }

    this.onEvent = onEvent;
    this.wsSendCallback = sendCallback;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      this.destination = this.audioContext.createMediaStreamDestination();
      
      // Use 1024 samples buffer (~42ms at 24kHz) for lower latency
      this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);
      
      source.connect(this.processor);
      this.processor.connect(this.destination);
      
      this.processor.onaudioprocess = (e) => {
        if (this.isMuted || !this.wsSendCallback) return;
        
        const inputBuffer = e.inputBuffer;
        const channelData = inputBuffer.getChannelData(0);
        
        const pcmData = this.float32ToPcm16(channelData);
        
        this.wsSendCallback(pcmData);
      };

      this.isStreaming = true;
      this.onEvent?.("streaming_started");
      
      console.log("Audio streaming started");
      return true;
    } catch (e) {
      console.error("Failed to start audio streaming:", e);
      this.stopStreaming();
      return false;
    }
  }

  private float32ToPcm16(float32Array: Float32Array): ArrayBuffer {
    const int16Array = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    
    return int16Array.buffer;
  }

  stopStreaming() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.destination) {
      this.destination.disconnect();
      this.destination = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isStreaming = false;
    this.wsSendCallback = null;
    this.onEvent?.("streaming_stopped");
    
    console.log("Audio streaming stopped");
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  getState(): AudioStreamState {
    return {
      isStreaming: this.isStreaming,
      isMuted: this.isMuted,
    };
  }
}

export const audioStreamingService = new AudioStreamingService();
