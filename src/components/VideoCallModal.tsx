import { useRef, useEffect } from "react";
import type { Chat } from "../types";
import "./VideoCallModal.css";

interface VideoCallModalProps {
  chat: Chat;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: "calling" | "ringing" | "connected";
  isMuted: boolean;
  isVideoOff: boolean;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}

function attachAndPlay(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
) {
  if (!video) return;
  if (!stream) {
    video.srcObject = null;
    return;
  }
  video.srcObject = stream;
  void video.play().catch(() => {});
}

export function VideoCallModal({
  chat,
  localStream,
  remoteStream,
  status,
  isMuted,
  isVideoOff,
  onEndCall,
  onToggleMute,
  onToggleVideo,
}: VideoCallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    attachAndPlay(localVideoRef.current, localStream);
  }, [localStream]);

  useEffect(() => {
    attachAndPlay(remoteVideoRef.current, remoteStream);
  }, [remoteStream]);

  const hasLiveRemote = Boolean(
    remoteStream?.getTracks().some((t) => t.readyState === "live"),
  );
  const hasRemoteVideo = Boolean(
    remoteStream
      ?.getVideoTracks()
      .some((t) => t.readyState === "live" && t.enabled),
  );
  const showRemoteSurface = status === "connected" && hasLiveRemote;
  const remoteWaiting = status === "connected" && !hasLiveRemote;

  return (
    <div
      className="video-call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Video call"
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
          <div
            className={`remote-video-container ${showRemoteSurface ? "has-remote" : ""}`}
          >
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="remote-video"
            />
            {showRemoteSurface && !hasRemoteVideo && (
              <div className="remote-audio-only">
                Connected — remote camera off
              </div>
            )}
            {!showRemoteSurface && (
              <div className="remote-placeholder">
                {remoteWaiting && <p>Waiting for remote media…</p>}
                {status === "calling" && <p>Connecting to call…</p>}
                {status === "ringing" && <p>Waiting for answer…</p>}
              </div>
            )}
          </div>

          <div className="local-video-container">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`local-video ${isVideoOff ? "video-off" : ""}`}
            />
            {isVideoOff && (
              <div className="video-off-placeholder">Camera off</div>
            )}
          </div>
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
            className={`control-btn ${isVideoOff ? "active" : ""}`}
            onClick={onToggleVideo}
            title={isVideoOff ? "Turn camera on" : "Turn camera off"}
            aria-pressed={isVideoOff}
          >
            {isVideoOff ? "📵" : "📹"}
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
      </div>
    </div>
  );
}

interface IncomingCallModalProps {
  chat: Chat;
  callerName: string;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({
  chat,
  callerName,
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
            📹
          </div>
          <h3>Incoming call</h3>
          <p className="caller-line">{callerName}</p>
          <span className="chat-name">in {chat.name}</span>
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
            title="Accept"
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}
