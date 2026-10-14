'use client';

import { useEffect, useRef } from 'react';

// Vitto's message box on the Today tab, laid out like a messaging app: a
// full-width text area that grows with what's typed (so a whole meal fits
// without scrolling sideways), with photo / barcode / voice along the bottom
// and send on the right. 16px text so iOS doesn't zoom the page on focus.
// Enter sends; Shift+Enter adds a line.
export default function VittoComposer({ value, onChange, onSend, sending, listening, photoLoading, onPhoto, onScan, onVoice, suggestions = [], onPickSuggestion }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  listening: boolean;
  photoLoading: boolean;
  onPhoto: () => void;
  onScan: () => void;
  /** Only passed where the browser supports speech recognition. */
  onVoice?: () => void;
  /** Food names matching what's being typed — tap one to complete it. */
  suggestions?: { label: string; from: number }[];
  onPickSuggestion?: (s: { label: string; from: number }) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to max-h, then scroll inside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className={`rounded-3xl border bg-neutral-50 transition-colors focus-within:bg-white ${listening ? 'border-red-300' : 'border-border focus-within:border-brand'}`}>
      {suggestions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 -mb-0.5" role="listbox" aria-label="Food suggestions">
          {suggestions.map((sg) => (
            // onMouseDown keeps focus in the text box so the keyboard doesn't flicker shut
            <button
              key={sg.label}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPickSuggestion?.(sg)}
              className="flex-shrink-0 rounded-full border border-brand/30 bg-brand-light text-brand-dark text-xs font-medium px-3 py-1 whitespace-nowrap active:scale-95"
            >
              {sg.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        rows={1}
        enterKeyHint="send"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); }
        }}
        placeholder={listening ? 'Listening…' : 'Tell Vitto what you ate… e.g. 2 eggs, toast and a flat white'}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base leading-snug text-neutral-900 placeholder:text-neutral-400 outline-none max-h-40"
      />
      <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
        <ComposerButton title="Log from a photo" onClick={onPhoto} disabled={photoLoading}>
          {photoLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
          )}
        </ComposerButton>
        <ComposerButton title="Scan a barcode" onClick={onScan}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>
        </ComposerButton>
        {onVoice && (
          <ComposerButton title="Log by voice" onClick={onVoice} active={listening}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
          </ComposerButton>
        )}
        <span className="flex-1" />
        <button
          onClick={onSend}
          disabled={sending || !value.trim()}
          aria-label="Send"
          className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center transition-[transform,opacity] active:scale-90 disabled:opacity-30"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
        </button>
      </div>
    </div>
  );
}

function ComposerButton({ children, title, onClick, disabled, active }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-[transform,colors] active:scale-90 disabled:opacity-50 ${
        active ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}
