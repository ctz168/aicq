import React, { useRef, useState, useCallback, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  duration?: number;
  fileName?: string;
  className?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCurrentTime(seconds: number): string {
  return formatDuration(seconds);
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  duration: propDuration,
  fileName = '',
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    hideControlsTimer();
  }, [hideControlsTimer]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setTotalDuration(video.duration);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const container = e.currentTarget;
    if (!video || !container) return;
    const rect = container.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) videoRef.current.volume = val;
    setIsMuted(val === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    hideControlsTimer();
  }, [hideControlsTimer]);

  const handleVideoError = useCallback(() => {
    setHasError(true);
  }, []);

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  if (hasError) {
    return (
      <div className={`video-player video-player-error ${className}`}>
        <span className="video-player-error-icon">🎬</span>
        <span className="video-player-error-text">视频加载失败</span>
        {fileName && <span className="video-player-error-name">{fileName}</span>}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`video-player ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="video-player-video"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleVideoError}
        playsInline
        preload="metadata"
      />

      {/* Play button overlay */}
      {!isPlaying && (
        <div className="video-player-play-overlay" onClick={togglePlay}>
          <div className="video-player-play-btn">▶</div>
        </div>
      )}

      {/* Controls */}
      <div className={`video-player-controls ${showControls ? 'visible' : 'hidden'}`}>
        {/* Progress bar */}
        <div className="video-player-progress" onClick={handleSeek}>
          <div className="video-player-progress-bar">
            <div
              className="video-player-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Bottom controls */}
        <div className="video-player-bottom">
          <div className="video-player-left">
            <button className="vp-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <span className="video-player-time">
              {formatCurrentTime(currentTime)} / {formatDuration(totalDuration)}
            </span>
          </div>

          <div className="video-player-right">
            <div className="video-player-volume">
              <button className="vp-btn" onClick={toggleMute} title={isMuted ? '取消静音' : '静音'}>
                {isMuted ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-player-volume-slider"
              />
            </div>
            <button className="vp-btn" onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '全屏'}>
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
