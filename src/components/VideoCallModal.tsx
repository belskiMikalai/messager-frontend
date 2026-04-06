import { useEffect, useState } from "react";
import type { Chat } from "../types";
import type { Participant } from "./ParticipantGrid";
import { ParticipantGrid } from "./ParticipantGrid";
import "./VideoCallModal.css";

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "videoinput";
}

interface VideoCallModalProps {
  chat: Chat;
  localStream: MediaStream | null;
  status: "calling" | "ringing" | "connected";
  isMuted: boolean;
  onEndCall: () => void;
  onToggleMute: () => void;
  onDeviceChange?: (deviceId: string, kind: "audioinput" | "videoinput") => void;
  audioMuted?: boolean;
  onToggleAudioMute?: () => void;
  participants?: Participant[];
  localUserId?: number;
}

export function VideoCallModal({
  chat,
  localStream,
  status,
  isMuted,
  onEndCall,
  onToggleMute,
  onDeviceChange,
  audioMuted = false,
  onToggleAudioMute,
  participants = [],
  localUserId = 0,
}: VideoCallModalProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");

  useEffect(() => {
    async function loadDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audio = devices
          .filter(d => d.kind === "audioinput")
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`, kind: "audioinput" as const }));
        setAudioDevices(audio);
        if (audio.length) setSelectedMic(audio[0].deviceId);
      } catch (e) {
        console.error("Failed to enumerate devices:", e);
      }
    }
    loadDevices();
  }, []);

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    onDeviceChange?.(deviceId, "audioinput");
  };

  return (
    <div
      className="video-call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Audio call"
    >
      <div className="video-call-modal">
        <div className="video-call-header">
          <div className="video-call-title">
            <h3>{chat.name}</h3>
            <span className={`call-status ${status}`}>
              {status === "calling" && "Connecting…"}
              {status === "ringing" && "Ringing…"}
              {status === "connected" && "Live"}
            </span>
          </div>
        </div>

        <div className="video-call-content">
          <ParticipantGrid
            participants={participants}
            localUserId={localUserId}
            localStream={localStream}
          />
        </div>

        <div className="video-call-controls">
          <button
            type="button"
            className={`control-btn ${isMuted ? "active" : ""}`}
            onClick={onToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            aria-pressed={isMuted}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            className="control-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            type="button"
            className={`control-btn ${audioMuted ? "active" : ""}`}
            onClick={onToggleAudioMute}
            title={audioMuted ? "Unmute" : "Mute"}
          >
            {audioMuted ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            className="control-btn end-call"
            onClick={onEndCall}
            title="End call"
          >
            ✕
          </button>
        </div>
        
        {showSettings && (
          <div className="device-settings-panel">
            <h4>Device Settings</h4>
            <div className="device-option">
              <label>🎤 Microphone</label>
              <select value={selectedMic} onChange={e => handleMicChange(e.target.value)}>
                {audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface IncomingCallModalProps {
  chat: Chat;
  callerName: string;
  isGroup?: boolean;
  participants?: { id: number; name: string }[];
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({
  chat,
  callerName,
  isGroup = false,
  participants = [],
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  return (
    <div
      className="video-call-overlay incoming-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
    >
      <div className="incoming-call-modal">
        <div className="incoming-pulse" aria-hidden />
        <div className="incoming-call-content">
          <div className="caller-avatar" aria-hidden>
            {isGroup ? "👥" : "📞"}
          </div>
          <h3>{isGroup ? "Group call" : "Incoming call"}</h3>
          <p className="caller-line">{callerName}</p>
          <span className="chat-name">in {chat.name}</span>
          {isGroup && participants.length > 0 && (
            <div className="group-participants">
              <span className="participants-label">{participants.length} in call</span>
            </div>
          )}
        </div>
        <div className="incoming-call-actions">
          <button
            type="button"
            className="reject-btn"
            onClick={onReject}
            title="Decline"
          >
            ✕
          </button>
          <button
            type="button"
            className="accept-btn"
            onClick={onAccept}
            title={isGroup ? "Join" : "Accept"}
          >
            {isGroup ? "📞" : "✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
