import React, { useState, useCallback } from 'react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  thumbnailSrc?: string;
  className?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  alt = '',
  thumbnailSrc,
  className = '',
}) => {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const openLightbox = useCallback(() => {
    setIsLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeLightbox();
  }, [closeLightbox]);

  if (hasError) {
    return (
      <div className={`image-preview image-preview-error ${className}`}>
        <span className="image-preview-error-icon">🖼️</span>
        <span className="image-preview-error-text">图片加载失败</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={`image-preview ${className}`}
        onClick={openLightbox}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {!isLoaded && (
          <div className="image-preview-placeholder">
            <div className="image-preview-spinner" />
          </div>
        )}
        <img
          src={thumbnailSrc || src}
          alt={alt}
          className={`image-preview-thumb ${isLoaded ? 'loaded' : 'loading'}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          loading="lazy"
        />
        <div className="image-preview-overlay">
          <span className="image-preview-zoom">🔍</span>
        </div>
      </div>

      {/* Lightbox */}
      {isLightboxOpen && (
        <div
          className="lightbox-overlay"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-label="图片预览"
        >
          <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox} title="关闭">
              ✕
            </button>
            <img
              src={src}
              alt={alt}
              className="lightbox-image"
              onLoad={() => setIsLoaded(true)}
            />
            {alt && <div className="lightbox-caption">{alt}</div>}
          </div>
        </div>
      )}
    </>
  );
};

export default ImagePreview;
