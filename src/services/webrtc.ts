const METERED_APP_NAME = import.meta.env.VITE_METERED_APP_NAME || "";
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY || "";

export interface CallState {
  status: "idle" | "calling" | "ringing" | "connected" | "ended";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

class WebRTCService {
  private localStream: MediaStream | null = null;
  private turnConfig: RTCIceServer[] = [];

  async initTURN(): Promise<void> {
    const defaultConfig: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    if (!METERED_APP_NAME || !METERED_API_KEY) {
      this.turnConfig = defaultConfig;
      return;
    }

    try {
      const res = await fetch(
        `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
      );
      
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      
      const topServers = [
        { urls: "stun:stun.relay.metered.ca:80" },
        { 
          urls: "turn:global.relay.metered.ca:443", 
          username: "0fe80f7c31baf8126262d169", 
          credential: "wyOdenG62b30TVh3" 
        },
        { 
          urls: "turns:global.relay.metered.ca:443?transport=tcp", 
          username: "0fe80f7c31baf8126262d169", 
          credential: "wyOdenG62b30TVh3" 
        },
      ];
      
      this.turnConfig = topServers;
    } catch (e) {
      this.turnConfig = defaultConfig;
    }
  }

  getIceServers(): RTCIceServer[] {
    return this.turnConfig;
  }

  async getAudioStream(): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return this.localStream;
    } catch (e) {
      console.error("Failed to get audio stream:", e);
      return null;
    }
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  async switchAudioDevice(deviceId: string): Promise<boolean> {
    if (!this.localStream) return false;
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      
      const audioTrack = newStream.getAudioTracks()[0];
      if (!audioTrack) return false;
      
      const oldAudioTrack = this.localStream.getAudioTracks()[0];
      if (oldAudioTrack) {
        oldAudioTrack.stop();
        this.localStream.removeTrack(oldAudioTrack);
      }
      
      this.localStream.addTrack(audioTrack);
      return true;
    } catch (e) {
      console.error("Failed to switch audio device:", e);
      return false;
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  endCall(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}

export const webRTCService = new WebRTCService();
