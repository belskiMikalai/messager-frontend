const METERED_APP_NAME = import.meta.env.VITE_METERED_APP_NAME || "";
const METERED_API_KEY = import.meta.env.VITE_METERED_API_KEY || "";

export interface CallState {
  status: "idle" | "calling" | "ringing" | "connected" | "ended";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

type CallEventHandler = (event: string, data?: unknown) => void;

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private onCallEvent: CallEventHandler | null = null;
  private turnConfig: RTCIceServer[] = [];
  private onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null;

  async initTURN() {
    // Use default STUN servers as fallback
    const defaultConfig: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];

    if (!METERED_APP_NAME || !METERED_API_KEY) {
      console.warn("Metered credentials not configured, using STUN only");
      this.turnConfig = defaultConfig;
      return;
    }

    try {
      // Use apiKey endpoint (from Metered dashboard instructions)
      const res = await fetch(
        `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
      );
      
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      
      const iceServers = await res.json();
      
      // Limit to top 3 servers to avoid warning and speed up discovery
      const topServers = [
        { urls: "stun:stun.relay.metered.ca:80" }, // STUN
        { 
          urls: "turn:global.relay.metered.ca:443", 
          username: "0fe80f7c31baf8126262d169", 
          credential: "wyOdenG62b30TVh3" 
        }, // TURN TLS
        { 
          urls: "turns:global.relay.metered.ca:443?transport=tcp", 
          username: "0fe80f7c31baf8126262d169", 
          credential: "wyOdenG62b30TVh3" 
        }, // TURN over TLS/TCP
      ];
      
      if (Array.isArray(iceServers) && iceServers.length > 0) {
        this.turnConfig = topServers;
        console.log("TURN credentials loaded successfully - using top 3 servers");
      } else {
        console.warn("No TURN credentials in API response, using defaults");
        this.turnConfig = defaultConfig;
      }
    } catch (e) {
      console.error("Failed to get TURN credentials:", e);
      
      // Use reduced fallback - only 3 servers
      this.turnConfig = [
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
      console.log("Using reduced Metered fallback credentials (3 servers)");
    }
  }

  async startCall(_chatId: number, onEvent: CallEventHandler, onIceCandidate?: (candidate: RTCIceCandidate) => void): Promise<MediaStream | null> {
    this.onCallEvent = onEvent;
    if (onIceCandidate) {
      this.onIceCandidate = onIceCandidate;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      await this.createPeerConnection();

      if (!this.peerConnection) {
        throw new Error("Failed to create peer connection");
      }

      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Set up ICE candidate handler
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.onIceCandidate) {
          this.onIceCandidate(event.candidate);
        }
      };

      return this.localStream;
    } catch (e) {
      console.error("Failed to start call:", e);
      onEvent("error", "Failed to access camera/microphone");
      return null;
    }
  }

  private async createPeerConnection() {
    this.remoteStream = null;
    this.peerConnection = new RTCPeerConnection({ iceServers: this.turnConfig });

    // Log ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log("ICE Connection State:", state);
      
      if (state === "connected" || state === "completed") {
        console.log("ICE connected successfully!");
        this.onCallEvent?.("connected");
      } else if (state === "failed" || state === "disconnected" || state === "closed") {
        console.log("ICE connection failed/disconnected:", state);
        this.onCallEvent?.("ended");
      }
    };

    // Log ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const cand = event.candidate;
        console.log("🔵 ICE candidate generated:", {
          address: cand.address,
          port: cand.port,
          protocol: cand.protocol,
          type: cand.type,
          ttl: cand.tcpType
        });
        if (this.onIceCandidate) {
          this.onIceCandidate(event.candidate);
        }
      } else {
        console.log("✅ All ICE candidates gathered (null event)");
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      const primary = event.streams[0];
      if (primary?.getTracks().length) {
        primary.getTracks().forEach((track) => {
          if (!this.remoteStream!.getTracks().some((t) => t.id === track.id)) {
            this.remoteStream!.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }
      this.onCallEvent?.("remote_stream", this.remoteStream);
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === "connected") {
        this.onCallEvent?.("connected");
      } else if (state === "failed" || state === "closed") {
        this.onCallEvent?.("ended");
      }
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;

    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      return offer;
    } catch (e) {
      console.error("Failed to create offer:", e);
      return null;
    }
  }

  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
    if (!this.peerConnection) return null;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      return answer;
    } catch (e) {
      console.error("Failed to handle offer:", e);
      return null;
    }
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (e) {
      console.error("Failed to handle answer:", e);
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("Failed to add ICE candidate:", e);
    }
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return !videoTrack.enabled;
      }
    }
    return false;
  }

  endCall() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.onCallEvent = null;
    this.onIceCandidate = null;
  }

  setOnIceCandidate(handler: (candidate: RTCIceCandidate) => void) {
    this.onIceCandidate = handler;
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getConnectionState(): string | null {
    return this.peerConnection?.iceConnectionState || null;
  }
}

export const webRTCService = new WebRTCService();