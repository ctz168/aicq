import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  data: string;
  size?: number;
  className?: string;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ data, size = 200, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    setError(null);

    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#1a1a2e',
      },
    }).catch((err) => {
      setError('二维码生成失败');
      console.error('[QRCode]', err);
    });
  }, [data, size]);

  if (error) {
    return <div className={`qr-code-error ${className}`}>{error}</div>;
  }

  return <canvas ref={canvasRef} className={`qr-code-canvas ${className}`} />;
};

export default QRCodeDisplay;
