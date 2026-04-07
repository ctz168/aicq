/**
 * AICQ Call Panel Component
 * 
 * Lightweight, memory-efficient call UI with:
 * - Voice/video call display
 * - Real-time call stats overlay
 * - Mute/camera/hangup controls
 * - Incoming call notification
 * - Minimal DOM footprint for performance
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { CallType, CallState, CallStats } from '../services/WebRTCService';
import { WebRTCService } from '../services/WebRTCService';

interface CallPanelProps {
  webrtc: WebRTCService;
  peerName: string;
  peerAvatar?: string;
  isVideoCall: boolean;
}

/** Format seconds to mm:ss */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const CallPanel: React.FC<CallPanelProps> = ({ webrtc, peerName, peerAvatar, isVideoCall }) => {
  const [callState, setCallState] = useState<CallState>(webrtc.callState);
  const [isMuted, setIsMuted] = useState(webrtc.isMuted);
  const [isCameraOff, setIsCameraOff] = useState(webrtc.isCameraOff);
  const [duration, setDuration] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<CallStats>(webrtc.stats);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── State tracking ─────────────────────────────────────

  useEffect(() => {
    webrtc.setStateHandler((state) => {
      setCallState(state);
    });
    return () => { webrtc.setStateHandler(null); };
  }, [webrtc]);

  // ─── Duration counter ───────────────────────────────────

  useEffect(() => {
    if (callState === 'connected') {
      setDuration(0);
      durationTimer.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      if (durationTimer.current) {
        clearInterval(durationTimer.current);
        durationTimer.current = null;
      }
    }
    return () => {
      if (durationTimer.current) {
        clearInterval(durationTimer.current);
      }
    };
  }, [callState]);

  // ─── Stats polling ──────────────────────────────────────

  useEffect(() => {
    if (showStats && callState === 'connected') {
      statsTimer.current = setInterval(() => {
        setStats(webrtc.stats);
      }, 2000);
    }
    return () => {
      if (statsTimer.current) {
        clearInterval(statsTimer.current);
      }
    };
  }, [showStats, callState, webrtc]);

  // ─── Remote video stream ────────────────────────────────

  useEffect(() => {
    webrtc.setRemoteStreamHandler((stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    });
    return () => { webrtc.setRemoteStreamHandler(null); };
  }, [webrtc]);

  // ─── Controls ───────────────────────────────────────────

  const handleMute = useCallback(() => {
    const newState = webrtc.toggleMute();
    setIsMuted(newState);
  }, [webrtc]);

  const handleCamera = useCallback(() => {
    const newState = webrtc.toggleCamera();
    setIsCameraOff(newState);
  }, [webrtc]);

  const handleHangup = useCallback(() => {
    webrtc.hangup();
  }, [webrtc]);

  const handleToggleStats = useCallback(() => {
    setShowStats(s => !s);
  }, []);

  // ─── Render ─────────────────────────────────────────────

  const callStateText = useMemo(() => {
    switch (callState) {
      case 'ringing': return '响铃中...';
      case 'connecting': return '连接中...';
      case 'connected': return formatDuration(duration);
      case 'ended': return '通话已结束';
      default: return '';
    }
  }, [callState, duration]);

  // Don't render if idle
  if (callState === 'idle') return null;

  return (
    <div className="call-panel-overlay">
      <div className={`call-panel ${callState === 'ended' ? 'ending' : ''}`}>
        {/* Remote video (background for video calls) */}
        {isVideoCall && callState === 'connected' && (
          <video
            ref={remoteVideoRef}
            className="call-remote-video"
            autoPlay
            playsInline
            muted
          />
        )}

        {/* Dark overlay for better text visibility */}
        <div className="call-content">

          {/* Avatar / Video preview area */}
          <div className="call-avatar-area">
            {isVideoCall && callState === 'connected' && !isCameraOff ? (
              <video
                ref={localVideoRef}
                className="call-local-video-pip"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <div className="call-avatar">
                {peerAvatar ? (
                  <img src={peerAvatar} alt={peerName} />
                ) : (
                  <span>{peerName?.slice(0, 2) || '??'}</span>
                )}
              </div>
            )}
          </div>

          {/* Peer info */}
          <div className="call-peer-name">{peerName || 'Unknown'}</div>
          <div className={`call-state-text ${callState === 'connected' ? 'active' : ''}`}>
            {callState === 'connected' && (
              <span className="call-dot" />
            )}
            {callStateText}
          </div>

          {/* Call type indicator */}
          {isVideoCall && (
            <div className="call-type-badge">
              {isCameraOff ? '🔇' : '📹'} 视频通话
            </div>
          )}

          {/* Controls */}
          <div className="call-controls">
            {/* Mute button */}
            <button
              className={`call-ctrl-btn ${isMuted ? 'active' : ''}`}
              onClick={handleMute}
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>

            {/* Camera toggle (video only) */}
            {isVideoCall && (
              <button
                className={`call-ctrl-btn ${isCameraOff ? 'active' : ''}`}
                onClick={handleCamera}
                title={isCameraOff ? '开启摄像头' : '关闭摄像头'}
              >
                {isCameraOff ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17h-1c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h1l7 7V5c0-.55.45-1 1-1h7c.55 0 1 .45 1 1v1.5zM1 9v6c0 .83.67 1.5 1.5 1.5S4 15.83 4 15V9c0-.83-.67-1.5-1.5-1.5S1 8.17 1 9z" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                )}
              </button>
            )}

            {/* Stats toggle */}
            {callState === 'connected' && (
              <button
                className="call-ctrl-btn"
                onClick={handleToggleStats}
                title="通话质量"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4h2v4zm0-6h-2V7h2v4zm4 6h-2v-2h2v2zm0-4h-2v-4h2v4zm-8 4H6v-2h2v2zm0-4H6V7h2v4z" />
                </svg>
              </button>
            )}

            {/* Hangup */}
            <button className="call-ctrl-btn hangup" onClick={handleHangup} title="挂断">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          </div>

          {/* Stats overlay */}
          {showStats && callState === 'connected' && (
            <div className="call-stats-overlay">
              <div className="call-stat-row">
                <span>延迟</span>
                <span className={stats.rtt > 200 ? 'stat-warn' : ''}>
                  {stats.rtt} ms
                </span>
              </div>
              <div className="call-stat-row">
                <span>丢包</span>
                <span className={stats.packetLoss > 3 ? 'stat-warn' : ''}>
                  {stats.packetLoss}%
                </span>
              </div>
              <div className="call-stat-row">
                <span>码率</span>
                <span>{stats.bitrate} kbps</span>
              </div>
              {isVideoCall && (
                <>
                  <div className="call-stat-row">
                    <span>分辨率</span>
                    <span>{stats.resolution}</span>
                  </div>
                  <div className="call-stat-row">
                    <span>帧率</span>
                    <span>{stats.frameRate} fps</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Incoming Call Notification ──────────────────────────────── */

interface IncomingCallProps {
  callerId: string;
  callerName: string;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallNotification: React.FC<IncomingCallProps> = ({
  callerId,
  callerName,
  callType,
  onAccept,
  onReject,
}) => {
  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-avatar">
          <span>{callerName?.slice(0, 2) || '??'}</span>
        </div>
        <div className="incoming-call-info">
          <div className="incoming-call-name">{callerName || '未知来电'}</div>
          <div className="incoming-call-type">
            {callType === 'video' ? '📹 视频通话' : '📞 语音通话'}
          </div>
          <div className="incoming-call-label">来电响铃中...</div>
        </div>
        <div className="incoming-call-actions">
          <button className="incoming-call-btn accept" onClick={onAccept} title="接听">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
          </button>
          <button className="incoming-call-btn reject" onClick={onReject} title="拒绝">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallPanel;
