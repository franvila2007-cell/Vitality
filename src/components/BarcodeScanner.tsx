'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  // Kept in a ref rather than an effect dependency — onDetected is a fresh
  // closure from the parent on every render, and this effect must only run
  // once (it opens the camera stream); depending on it directly would tear
  // down and reopen the camera on every parent re-render.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access the camera here — enter the barcode number below instead.");
      return;
    }

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
      .catch((err) => {
        // Common causes: permission denied, no camera present, or (on iOS)
        // a standalone/home-screen PWA context where camera access can
        // behave differently than in a normal Safari tab. Whatever the
        // cause, the manual entry field below always works as a fallback.
        console.error('Barcode camera failed', err);
        const name = err instanceof Error ? err.name : '';
        const message =
          name === 'NotAllowedError' ? 'Camera permission was denied — enable it in your browser/phone settings, or enter the barcode number below.'
          : name === 'NotFoundError' ? 'No camera was found on this device — enter the barcode number below.'
          : "Couldn't start the camera — enter the barcode number below instead.";
        setError(message);
      });

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (code) onDetected(code);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <p className="text-white text-sm font-medium">Scan a barcode</p>
        <button onClick={onClose} className="text-white text-2xl leading-none px-2">✕</button>
      </div>
      <div className="flex-1 relative overflow-hidden bg-neutral-900 min-h-[200px]">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-36 border-2 border-white/80 rounded-lg" />
        </div>
      </div>
      {error ? (
        <p className="text-red-400 text-sm text-center px-4 pt-3 flex-shrink-0">{error}</p>
      ) : (
        <p className="text-white/60 text-xs text-center px-4 pt-3 flex-shrink-0">Point your camera at a product barcode</p>
      )}
      <form onSubmit={submitManual} className="flex gap-2 px-4 py-3 flex-shrink-0">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="Or type the barcode number"
          className="flex-1 min-w-0 rounded-lg border border-white/20 bg-white/10 text-white placeholder:text-white/40 px-3 py-2 text-sm outline-none focus:border-white/50"
        />
        <button type="submit" disabled={!manualCode.trim()} className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium disabled:opacity-40">
          Look up
        </button>
      </form>
    </div>
  );
}
