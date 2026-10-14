'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type TaughtFood = { name: string; type: 'per100g' | 'perUnit' | 'dish'; data: Record<string, unknown>; aliases: string[] };

type SearchResult = { code: string; name: string; brand: string | null; per100: { cal: number; prot: number; carb: number; fat: number }; servingG: number | null; packG: number | null; liquid: boolean; malta: boolean };

type Form = { editing: string | null; name: string; aliases: string; kind: 'per100g' | 'perUnit'; cal: string; prot: string; carb: string; fat: string; serving: string; liquid: boolean; source: string; note: string };

const EMPTY: Form = { editing: null, name: '', aliases: '', kind: 'per100g', cal: '', prot: '', carb: '', fat: '', serving: '', liquid: false, source: 'coach', note: '' };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9&' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const n = (v: string) => (v.trim() === '' ? NaN : parseFloat(v.replace(',', '.')));
const r1 = (v: number) => Math.round(v * 10) / 10;

// The coach's "Teach Vitto" page: add a brand or product (from Open Food Facts,
// a photo of the label, or typed from the packet), and review the foods Vitto
// has learned on his own. Everything lands in the shared foods database, so
// every client's Vitto knows it straight away.
export default function FoodsManager({ rows }: { rows: TaughtFood[] }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const scrollToForm = () => setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  async function search() {
    if (query.trim().length < 3) return;
    setSearching(true); setMsg(null); setResults(null);
    try {
      const res = await fetch(`/api/coach/foods/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(res.ok ? data.results : []);
      if (!res.ok) setMsg({ tone: 'bad', text: 'Search failed — try again.' });
    } catch { setMsg({ tone: 'bad', text: 'Search failed — check your connection.' }); }
    setSearching(false);
  }

  function fillFromResult(r: SearchResult) {
    const fullName = slug(r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.brand} ${r.name}` : r.name);
    const serving = r.servingG ?? (r.packG && r.packG <= 150 ? r.packG : null);
    setForm({ ...EMPTY, name: fullName, kind: 'per100g', cal: String(r.per100.cal), prot: String(r.per100.prot), carb: String(r.per100.carb), fat: String(r.per100.fat), serving: serving ? String(Math.round(serving)) : '', liquid: r.liquid, source: 'openfoodfacts', note: 'Filled from Open Food Facts — check it against the packet.' });
    scrollToForm();
  }

  async function readLabel(file: File) {
    setReading(true); setMsg(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve((rd.result as string).split(',')[1] || '');
        rd.onerror = () => reject(new Error('read failed'));
        rd.readAsDataURL(file);
      });
      const res = await fetch('/api/coach/foods/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mediaType: file.type }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read that photo.");
      const rd = data.reading as { name: string | null; brand: string | null; liquid: boolean; per100: { cal: number | null; prot: number | null; carb: number | null; fat: number | null }; servingG: number | null; packG: number | null; note: string | null };
      const nm = [rd.brand, rd.name].filter(Boolean).join(' ');
      const missing = (['cal', 'prot', 'carb', 'fat'] as const).filter((k) => rd.per100[k] == null);
      setForm({ ...EMPTY, name: slug(nm), cal: rd.per100.cal != null ? String(rd.per100.cal) : '', prot: rd.per100.prot != null ? String(rd.per100.prot) : '', carb: rd.per100.carb != null ? String(rd.per100.carb) : '', fat: rd.per100.fat != null ? String(rd.per100.fat) : '', serving: rd.servingG ? String(Math.round(rd.servingG)) : rd.packG && rd.packG <= 150 ? String(Math.round(rd.packG)) : '', liquid: rd.liquid, source: 'label-photo',
        note: `Read from your photo${rd.note ? ` — ${rd.note}` : ''}${missing.length ? ` Couldn't read: ${missing.join(', ')} — type those in.` : ' Check it against the packet before saving.'}` });
      scrollToForm();
    } catch (err) { setMsg({ tone: 'bad', text: err instanceof Error ? err.message : "Couldn't read that photo." }); }
    setReading(false);
  }

  function edit(f: TaughtFood) {
    const d = f.data as Record<string, number | string | boolean | undefined>;
    setForm({
      editing: f.name, name: f.name, aliases: f.aliases.join(', '), kind: f.type === 'perUnit' ? 'perUnit' : 'per100g',
      cal: String(d.cal ?? ''), prot: String(d.prot ?? ''), carb: String(d.carb ?? ''), fat: String(d.fat ?? ''),
      serving: String((f.type === 'perUnit' ? d.avgGrams : d.defaultGrams) ?? ''), liquid: d.liquid === true, source: String(d.source ?? 'coach'),
      note: d.learned ? 'Vitto learned this one himself — fix anything that looks off, then Save to approve it.' : '',
    });
    setMsg(null);
    scrollToForm();
  }

  const cal = n(form.cal), prot = n(form.prot), carb = n(form.carb), fat = n(form.fat);
  const implied = [prot, carb, fat].every(Number.isFinite) ? 4 * prot + 4 * carb + 9 * fat : NaN;
  const calMismatch = Number.isFinite(cal) && Number.isFinite(implied) && Math.abs(cal - implied) > Math.max(30, cal * 0.25);
  const valid = slug(form.name).length >= 2 && [cal, prot, carb, fat].every((v) => Number.isFinite(v) && v >= 0) && cal <= 900 * (form.kind === 'perUnit' ? 10 : 1);

  async function save() {
    if (!valid || saving) return;
    const key = form.editing ?? slug(form.name);
    setSaving(true); setMsg(null);
    const serving = n(form.serving);
    const base = { cal: Math.round(cal), prot: r1(prot), carb: r1(carb), fat: r1(fat), taught: true, source: form.source };
    const data = form.kind === 'perUnit'
      ? { ...base, label: key, avgGrams: Number.isFinite(serving) && serving > 0 ? serving : 50 }
      : { ...base, defaultGrams: Number.isFinite(serving) && serving > 0 ? serving : form.liquid ? 330 : 100, ...(form.liquid ? { liquid: true, canGrams: Number.isFinite(serving) && serving > 0 ? serving : 330, glassGrams: 250 } : {}) };
    const { error } = await supabase.from('foods_global').upsert({ name: key, type: form.kind, data }, { onConflict: 'name' });
    if (error) { setSaving(false); setMsg({ tone: 'bad', text: "Couldn't save — try again." }); return; }

    // Other names people use for it
    const aliases = [...new Set(form.aliases.split(',').map(slug).filter((a) => a && a !== key))];
    await supabase.from('food_synonyms').delete().eq('canonical', key);
    let skipped: string[] = [];
    if (aliases.length) {
      const { data: clash } = await supabase.from('foods_global').select('name').in('name', aliases);
      const clashing = new Set((clash || []).map((c) => c.name));
      skipped = aliases.filter((a) => clashing.has(a));
      const ok = aliases.filter((a) => !clashing.has(a));
      if (ok.length) await supabase.from('food_synonyms').upsert(ok.map((phrase) => ({ phrase, canonical: key })), { onConflict: 'phrase' });
    }
    setSaving(false);
    setMsg({ tone: 'good', text: `Vitto now knows "${key}" ✓${skipped.length ? ` (couldn't use ${skipped.join(', ')} as other names — those are already foods)` : ''}` });
    setForm(EMPTY); setResults(null); setQuery('');
    router.refresh();
  }

  async function remove(f: TaughtFood) {
    if (!window.confirm(`Make Vitto forget "${f.name}"?`)) return;
    const { error } = await supabase.from('foods_global').delete().eq('name', f.name);
    if (error) { setMsg({ tone: 'bad', text: "Couldn't remove it." }); return; }
    router.refresh();
  }

  async function approve(f: TaughtFood) {
    const { learned: _l, ...rest } = f.data as Record<string, unknown>;
    void _l;
    const { error } = await supabase.from('foods_global').update({ data: { ...rest, taught: true, approx: false } }).eq('name', f.name);
    if (error) { setMsg({ tone: 'bad', text: "Couldn't approve it." }); return; }
    router.refresh();
  }

  const learned = rows.filter((r) => r.data.learned === true);
  const taught = rows.filter((r) => r.data.learned !== true);
  const input = 'rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-brand transition-colors';

  return (
    <div className="flex flex-col gap-5">
      {msg && <p className={`text-sm rounded-xl px-3.5 py-2.5 ${msg.tone === 'good' ? 'bg-status-good-bg text-status-good-text' : msg.tone === 'bad' ? 'bg-status-bad-bg text-status-bad-text' : 'bg-neutral-100 text-neutral-600'}`}>{msg.text}</p>}

      {/* 1. Find it */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-medium">Find a product</p>
        <p className="text-xs text-neutral-400 mb-3">Search by name — Maltese products show first — or photograph the packet&rsquo;s nutrition table.</p>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="e.g. twistees, kinnie, benna milk…" className={`${input} flex-1 min-w-0`} />
          <button onClick={search} disabled={searching || query.trim().length < 3} className="rounded-lg bg-brand text-white px-4 text-sm font-medium disabled:opacity-50">{searching ? 'Searching…' : 'Search'}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readLabel(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={reading} className="mt-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-neutral-600 hover:border-brand hover:text-brand-dark disabled:opacity-50">
          {reading ? 'Reading the label…' : '📷 Read a nutrition label from a photo'}
        </button>
        {results && (
          <div className="mt-3 flex flex-col gap-1.5">
            {results.length === 0 && <p className="text-sm text-neutral-400">Nothing found — read the label from a photo, or type it in below.</p>}
            {results.map((r) => (
              <button key={r.code + r.name} onClick={() => fillFromResult(r)} className="flex items-center gap-2 rounded-xl border border-border bg-neutral-50 px-3 py-2 text-left hover:border-brand">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{r.malta && <span title="Sold in Malta">🇲🇹 </span>}{r.brand ? `${r.brand} · ` : ''}{r.name}</span>
                  <span className="block text-2xs text-neutral-400 tabular-nums">{r.per100.cal} kcal · {r.per100.prot}p {r.per100.carb}c {r.per100.fat}f per 100{r.liquid ? 'ml' : 'g'}{r.packG ? ` · pack ${Math.round(r.packG)}${r.liquid ? 'ml' : 'g'}` : ''}</span>
                </span>
                <span className="text-xs font-medium text-brand-dark flex-shrink-0">Use</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Check & save */}
      <div ref={formRef} className="bg-surface border border-brand/30 rounded-2xl p-4 scroll-mt-20">
        <p className="text-sm font-medium">{form.editing ? `Editing “${form.editing}”` : 'Teach Vitto a food'}</p>
        <p className="text-xs text-neutral-400 mb-3">Type it from the packet if you like. Vitto will use these numbers for every client.</p>
        {form.note && <p className="text-xs text-brand-dark bg-brand-light rounded-lg px-3 py-2 mb-3">{form.note}</p>}
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase text-neutral-400">What clients will call it</span>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} disabled={!!form.editing} placeholder="e.g. twistees cheese" className={`${input} disabled:opacity-60`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase text-neutral-400">Also known as (optional, comma-separated)</span>
            <input value={form.aliases} onChange={(e) => set({ aliases: e.target.value })} placeholder="e.g. twistees snack, cheese twistees" className={input} />
          </label>
          <div className="flex rounded-full bg-neutral-100 p-0.5 text-xs font-medium self-start">
            {(['per100g', 'perUnit'] as const).map((k) => (
              <button key={k} onClick={() => set({ kind: k })} className={`rounded-full px-3 py-1 ${form.kind === k ? 'bg-surface text-brand-dark shadow-sm' : 'text-neutral-500'}`}>{k === 'per100g' ? 'Numbers per 100g / 100ml' : 'Numbers per item'}</button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([['cal', 'Kcal'], ['prot', 'Protein'], ['carb', 'Carbs'], ['fat', 'Fat']] as const).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-3xs uppercase text-neutral-400">{label}</span>
                <input inputMode="decimal" value={form[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} className={input} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-3xs uppercase text-neutral-400">{form.kind === 'perUnit' ? 'Weight of one item (g, optional)' : `Usual serving (${form.liquid ? 'ml' : 'g'})`}</span>
              <input inputMode="decimal" value={form.serving} onChange={(e) => set({ serving: e.target.value })} placeholder={form.kind === 'perUnit' ? '50' : form.liquid ? '330' : '100'} className={input} />
            </label>
            {form.kind === 'per100g' && (
              <label className="flex items-center gap-2 pb-2 text-sm text-neutral-600"><input type="checkbox" checked={form.liquid} onChange={(e) => set({ liquid: e.target.checked })} /> It&rsquo;s a drink</label>
            )}
          </div>
          {calMismatch && <p className="text-2xs text-status-warn-text bg-status-warn-bg rounded-lg px-3 py-2">The macros add up to about {Math.round(implied)} kcal but you entered {Math.round(cal)} — worth double-checking against the packet.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={!valid || saving} className="rounded-lg bg-brand text-white px-5 py-2.5 text-sm font-medium disabled:opacity-40">{saving ? 'Saving…' : form.editing ? 'Save changes' : 'Teach Vitto'}</button>
            {(form.editing || form.name || form.cal) && <button onClick={() => { setForm(EMPTY); setMsg(null); }} className="rounded-lg border border-border px-4 py-2.5 text-sm text-neutral-500">Clear</button>}
          </div>
        </div>
      </div>

      {/* 3. What he knows */}
      {learned.length > 0 && (
        <FoodList title="Vitto learned these himself" sub="From Open Food Facts when a client mentioned them — check they look right." rows={learned} onEdit={edit} onRemove={remove} onApprove={approve} />
      )}
      <FoodList title="Taught by you" sub={taught.length ? undefined : 'Nothing yet — anything you teach shows up here.'} rows={taught} onEdit={edit} onRemove={remove} />
    </div>
  );
}

function FoodList({ title, sub, rows, onEdit, onRemove, onApprove }: { title: string; sub?: string; rows: TaughtFood[]; onEdit: (f: TaughtFood) => void; onRemove: (f: TaughtFood) => void; onApprove?: (f: TaughtFood) => void }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-sm font-medium">{title} <span className="text-2xs font-normal text-neutral-400">· {rows.length}</span></p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
      <div className="flex flex-col divide-y divide-border mt-2">
        {rows.map((f) => {
          const d = f.data as Record<string, number | string | undefined>;
          return (
            <div key={f.name} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-2xs text-neutral-400 tabular-nums truncate">
                  {d.cal} kcal · {d.prot}p {d.carb}c {d.fat}f {f.type === 'perUnit' ? 'per item' : `per 100${d.liquid ? 'ml' : 'g'}`}{f.aliases.length ? ` · also: ${f.aliases.join(', ')}` : ''}
                </p>
              </div>
              {onApprove && <button onClick={() => onApprove(f)} className="text-xs font-medium text-status-good-text flex-shrink-0">Looks right</button>}
              <button onClick={() => onEdit(f)} className="text-xs font-medium text-brand-dark flex-shrink-0">Edit</button>
              <button onClick={() => onRemove(f)} aria-label={`Remove ${f.name}`} className="text-neutral-300 hover:text-red-500 flex-shrink-0">✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
