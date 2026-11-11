'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { site } from '@/content/site';
import { requestBloom } from '@/lib/growth/bloom-event';
import { ArrowIcon } from '../Credit';

// Set NEXT_PUBLIC_WEB3FORMS_KEY in .env.local (see .env.example). Without it the form explains it can't send
// and offers the address instead; it never claims a message was sent unless Web3Forms confirms it.
const WEB3FORMS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? '';
const DRAFT_KEY = 'cordyceps-mail-draft';

type Values = { name: string; email: string; subject: string; message: string };
type Required = 'name' | 'email' | 'message';
type Errors = Partial<Record<Required, string>>;
type Phase = 'idle' | 'sending' | 'sent' | 'failed';

const EMPTY: Values = { name: '', email: '', subject: '', message: '' };
const REQUIRED: Required[] = ['name', 'email', 'message'];

function validate(v: Values): Errors {
  const errs: Errors = {};
  if (!v.name) errs.name = 'Add your name';
  if (!v.email) errs.email = 'Add an email I can reply to';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = "That email doesn't look right";
  if (!v.message) errs.message = 'Write a message';
  return errs;
}
const subjectFor = (v: Values) => v.subject || `Portfolio message from ${v.name}`;
const composed = (v: Values) => `${v.message}\n\n— ${v.name} (${v.email})`;

export function ContactForm() {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [reason, setReason] = useState('');
  const [copyNote, setCopyNote] = useState('');
  const [last, setLast] = useState<Values | null>(null);
  const [sentHeight, setSentHeight] = useState(0);
  const [bot, setBot] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<Partial<Record<Required, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  // restore an unsent draft
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as Partial<Values> | null;
      if (d) setValues(v => ({ ...v, ...d }));
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => { if (phase === 'sent') sentRef.current?.focus({ preventScroll: true }); }, [phase]);

  function onChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const key = e.target.name as keyof Values;
    const next = { ...values, [key]: e.target.value };
    setValues(next);
    if (key in errors) setErrors(({ [key as Required]: _, ...rest }) => rest);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }

  function fail(why: string, v: Values) { setReason(why); setLast(v); setCopyNote(''); setPhase('failed'); }

  function celebrate(btn: DOMRect) { // a sent message makes the page bloom beside the form
    const body = formRef.current?.closest('.body')?.getBoundingClientRect();
    if (!body) return;
    const rightRoom = innerWidth - body.right > 120;
    const x = rightRoom ? body.right + Math.min(140, (innerWidth - body.right) / 2) : body.left - 8;
    const sy = scrollY;
    requestBloom({ x, y: btn.top + sy, r: innerWidth <= 820 ? 110 : 200, away: rightRoom ? 0 : Math.PI });
    window.setTimeout(() => requestBloom({ x: x + (rightRoom ? 40 : 0), y: body.top + sy + 30, r: 140 }), 450);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bot) return; // a bot filled the hidden box
    const v: Values = { name: values.name.trim(), email: values.email.trim(), subject: values.subject.trim(), message: values.message.trim() };
    const errs = validate(v);
    setErrors(errs);
    const first = REQUIRED.find(k => errs[k]);
    if (first) { inputs.current[first]?.focus(); return; }
    if (!WEB3FORMS_KEY) { fail("Messages can't be sent from this page yet.", v); return; }

    setPhase('sending');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY, from_name: `${site.name} — portfolio`, subject: subjectFor(v),
          name: v.name, email: v.email, replyto: v.email, message: v.message, botcheck: false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (res.ok && data.success) {
        const btn = sendRef.current?.getBoundingClientRect();
        setSentHeight(formRef.current?.offsetHeight ?? 0); // keep the page height so the growth stays aligned
        setLast(v);
        setPhase('sent');
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
        if (btn) celebrate(btn);
      } else fail('The mail service turned the message down.', v);
    } catch {
      fail("The mail service couldn't be reached from here.", v);
    }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopyNote(`${label} copied.`); }
    catch { setCopyNote("Couldn't copy here. Select the address above instead."); }
  }

  const field = (key: Required) => ({
    id: `f-${key}`, name: key, value: values[key], onChange, required: true,
    'aria-invalid': !!errors[key], 'aria-describedby': `e-${key}`,
  });

  const mailto = last ? `mailto:${site.email}?subject=${encodeURIComponent(subjectFor(last))}&body=${encodeURIComponent(composed(last))}` : `mailto:${site.email}`;

  return (
    <>
      <form className="mail rv" ref={formRef} noValidate onSubmit={onSubmit} hidden={phase === 'sent'}>
        <div className="row">
          <div className={`field${errors.name ? ' bad' : ''}`}>
            <label className="credit-role" htmlFor="f-name">Your name</label>
            <input {...field('name')} autoComplete="name" ref={n => { inputs.current.name = n; }} />
            <p className="err" id="e-name">{errors.name}</p>
          </div>
          <div className={`field${errors.email ? ' bad' : ''}`}>
            <label className="credit-role" htmlFor="f-email">Your email</label>
            <input {...field('email')} type="email" autoComplete="email" ref={n => { inputs.current.email = n; }} />
            <p className="err" id="e-email">{errors.email}</p>
          </div>
        </div>
        <div className="field">
          <label className="credit-role" htmlFor="f-subject">Subject <span className="opt">(optional)</span></label>
          <input id="f-subject" name="subject" value={values.subject} onChange={onChange} />
        </div>
        <div className={`field${errors.message ? ' bad' : ''}`}>
          <label className="credit-role" htmlFor="f-message">Message</label>
          <textarea {...field('message')} rows={6} ref={n => { inputs.current.message = n; }} />
          <p className="err" id="e-message">{errors.message}</p>
        </div>
        <input type="checkbox" name="botcheck" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
               checked={bot} onChange={e => setBot(e.target.checked)} />
        <div className="actions">
          <button className="send" type="submit" ref={sendRef} disabled={phase === 'sending'}>
            <span>{phase === 'sending' ? 'Transmitting…' : 'Send message'}</span>
            <ArrowIcon />
          </button>
          <p className="meta" role="status" aria-live="polite">{phase === 'sending' ? 'Sending…' : ''}</p>
        </div>
      </form>

      {phase === 'failed' && (
        <div className="fallback">
          <p className="credit-role">Not sent</p>
          <p>
            {reason} Email me directly at <a className="addr" href={mailto}>{site.email}</a> — your message is still in the form, ready to copy.
          </p>
          <div className="fb-actions">
            <button type="button" className="ghost" onClick={() => last && copy(composed(last), 'Message')}>Copy message</button>
            <button type="button" className="ghost" onClick={() => copy(site.email, 'Address')}>Copy address</button>
          </div>
          <p className="meta" aria-live="polite">{copyNote}</p>
        </div>
      )}

      {phase === 'sent' && last && (
        <div className="sent" ref={sentRef} tabIndex={-1} style={{ minHeight: sentHeight || undefined }}>
          <div className="credit">
            <p className="credit-role">Message received</p>
            <p className="credit-name md">Thank you, {last.name}</p>
          </div>
          <p>It&apos;s in my inbox. I&apos;ll write back to <span className="addr">{last.email}</span>.</p>
        </div>
      )}
    </>
  );
}
