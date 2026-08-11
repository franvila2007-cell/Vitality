'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref rather than an effect dependency — onDetected is a fresh
  // closure from the parent on every render, and this effect must only run
  // once (it opens the camera stream); depending on it directly would tear
  // down and reopen the camera on every parent re-render.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let stopped = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (result) => {
        if (stopped || !result) return;
        stopped = true;
        controls?.stop();
        onDetectedRef.current(result.getText());
      })
      .then((c) => {
        if (stopped) c.stop();
        else controls = c;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not access the camera.'));

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <p className="text-white text-sm font-medium">Scan a barcode</p>
        <button onClick={onClose} className="text-white text-2xl leading-none px-2">✕</button>
      </div>
      <div className="flex-1 relative overflow-hidden bg-neutral-900">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-36 border-2 border-white/80 rounded-lg" />
        </div>
      </div>
      <p className="text-white/60 text-xs text-center px-4 py-3 flex-shrink-0">
        {error ? <span className="text-red-400">{error}</span> : 'Point your camera at a product barcode'}
      </p>
    </div>
  );
}
