'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, ErrorBanner, SectionTitle, relativeTime } from '@/lib/ui';
import type { AiContext } from '../api/ai-context/route';

/**
 * The one thing worth understanding about this screen: it's not
 * documentation, it's a *briefing*. Docs describe the system as it should be
 * read cold, on its own, months later; a briefing catches an AI session (or
 * a person) up on where things actually stand right now, including the
 * messy parts — what's half-done, what broke recently, what NOT to redo.
 * Keep it that way rather than letting it drift into a copy of the README.
 */
export function AiContextClient() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    (async () => {
      try {
        const res = await fetch('/api/ai-context');
        const body = await res.json();
        if (!res.ok || body.error) {
          setError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        const item = body.item as AiContext;
        setContent(item.content);
        setSaved(item.content);
        setUpdatedAt(item.updated_at);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Losing an edit to this specifically — a long, carefully-written briefing
  // — is a worse outcome than the same mistake almost anywhere else in the
  // dashboard, so it gets a guard the other tabs don't bother with.
  useEffect(() => {
    const dirty = content !== saved;
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [content, saved]);

  const dirty = content !== saved;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const item = body.item as AiContext;
      setSaved(item.content);
      setUpdatedAt(item.updated_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied or unavailable — nothing to fall back to
      // in a plain button handler; the textarea itself is still selectable.
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <p className="text-[13.5px] text-dim">
          A briefing for whoever picks this project up next — a person or an AI session that's
          lost its conversation history. Written in plain language, kept current by whoever's
          working on this. Not read by the app itself; paste it into a fresh session to catch it up.
        </p>
        <p className="shrink-0 font-mono text-[11px] text-faint">
          {updatedAt ? `Saved ${relativeTime(new Date(updatedAt).getTime())}` : loading ? 'Loading…' : 'Never saved'}
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle sub="Project purpose, architecture, current state, known issues, what not to redo.">
            The briefing
          </SectionTitle>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void copy()}
              disabled={!content}
              className="rounded-full border border-edge px-3.5 py-1.5 text-[12.5px] font-bold text-dim transition hover:text-white disabled:opacity-40"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="rounded-full bg-snap px-4 py-1.5 text-[12.5px] font-bold text-black transition disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          placeholder={
            loading
              ? 'Loading…'
              : "What is Tagit, in two sentences? What's the stack? What's actually shipped vs. still open? What broke recently and how? What would someone new get wrong without being told?"
          }
          spellCheck={false}
          className="h-[60vh] w-full resize-y rounded-xl border border-edge bg-surfhi p-4 font-mono text-[13px] leading-relaxed text-white placeholder:text-faint focus:border-snap focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between">
          <p className="font-mono text-[11px] text-faint">{content.length.toLocaleString()} characters</p>
          {dirty ? <p className="text-[11.5px] text-flame">Unsaved changes</p> : null}
        </div>
      </Card>
    </div>
  );
}
