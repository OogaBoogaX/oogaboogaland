// Explicit rescue HTTP client. Nothing starts until a scene installs it with an
// expected world. One command in flight, exact-sequence retries, and generation
// guards prevent late replies from a departed account/scene mutating the visit.
(() => {
  'use strict';
  const B = window.BL, S = B.rescueShared;
  const dog = d => d === null || S.exact(d, ['id', 'name', 'breed']) && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 80
    && typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 16 && !/[\x00-\x1f\x7f<>]/.test(d.name) && S.integer(d.breed) && d.breed < 6;
  const receipt = r => S.exact(r, ['ok', 'reason', 'dog']) && typeof r.ok === 'boolean' && typeof r.reason === 'string' && r.reason.length <= 80 && dog(r.dog);
  const contextFields = ['world', 'epoch', 'revision', 'rescueRevision', 'accountId', 'generation', 'bodyId', 'zone'];
  const create = ({ world, fetcher = fetch, clock = Date.now, onFrame, onPrivate = () => true, onSession = () => {}, onReceipt = () => {}, onLost = () => {}, onError = () => {} }) => {
    if (!S.worldId(world) || typeof fetcher !== 'function' || typeof clock !== 'function' || typeof onFrame !== 'function') throw Error('rescue client configuration');
    const receiver = S.create(world), requests = new Set();
    let connection = null, key = '', version = 0, disposed = false, reading = false, online = false, pending = null, context = null, session = null, nextSequence = 1, due = 0;
    const same = v => !disposed && version === v;
    const abort = () => { for (const c of requests) c.abort(); requests.clear(); };
    const setConnection = next => {
      if (disposed) return false;
      if (!S.exact(next, ['accountId', 'connection', 'zone']) || next.accountId !== null && (!S.integer(next.accountId) || !next.accountId)
        || typeof next.connection !== 'string' || next.accountId !== null && !/^[A-Za-z0-9-]{1,64}$/.test(next.connection)
        || !S.zoneId(next.zone)) throw Error('rescue client connection');
      const nextKey = JSON.stringify(next); if (nextKey === key) return false;
      connection = { ...next }; key = nextKey; version++; abort(); reading = online = false; pending = context = session = null; nextSequence = 1; due = 0; onLost(); return true;
    };
    const request = async (path, body, v) => {
      const c = new AbortController(); requests.add(c);
      try {
        const response = await fetcher(`/api/rescue/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
          cache: 'no-store', signal: c.signal, headers: { ...(connection?.accountId ? { 'x-room-token': connection.connection } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (!same(v)) throw Error('rescue visit changed');
        const text = await response.text(); if (!same(v) || text.length > 128 * 1024) throw Error('rescue response bounds');
        const out = JSON.parse(text); if (!response.ok) throw Error('rescue unavailable'); return out;
      } finally { requests.delete(c); }
    };
    const accept = frame => {
      if (!receiver.accept(frame) || onFrame(receiver.current) === false) throw Error('invalid rescue frame');
    };
    const finish = (p, result, frame) => {
      if (pending !== p || !receipt(result)) throw Error('rescue receipt mismatch');
      if (!S.validate(frame) || frame.world !== world) throw Error('invalid rescue receipt frame');
      const current = receiver.current;
      if (current && frame.epoch < current.epoch) { pending = null; throw Error('rescue receipt superseded'); }
      if (!current || frame.epoch > current.epoch || frame.revision >= current.revision) accept(frame);
      pending = null; p.result = result; onReceipt(p.input, result); return result;
    };
    const refresh = async () => {
      if (disposed || !connection || reading) return false;
      reading = true; const v = version;
      try {
        const out = await request(connection.accountId ? 'state' : 'public', undefined, v);
        if (out.status !== 'ok' || !S.validate(out.frame) || out.frame.world !== world) throw Error('invalid rescue response');
        if (!connection.accountId) { accept(out.frame); return true; }
        const c = out.context, state = out.session;
        if (!S.exact(c, contextFields) || c.world !== world || c.accountId !== connection.accountId || c.zone !== connection.zone
          || !S.worldId(c.bodyId) || !['epoch', 'revision', 'rescueRevision', 'generation'].every(k => S.integer(c[k]) && c[k] > 0)
          || c.epoch !== out.frame.epoch || c.rescueRevision !== out.frame.revision
          || !S.exact(state, ['bodyId', 'zone', 'sequence', 'command', 'receipt', 'dog']) || state.bodyId !== c.bodyId || state.zone !== c.zone
          || !S.integer(state.sequence) || !dog(state.dog) || state.receipt !== null && !receipt(state.receipt)) throw Error('invalid private rescue state');
        if (context && (context.epoch !== c.epoch || context.generation !== c.generation || context.bodyId !== c.bodyId)) {
          pending = null; nextSequence = 1; onLost();
        }
        accept(out.frame);
        if (onPrivate(out.companions, c) === false) throw Error('invalid private companions');
        context = { ...c }; session = JSON.parse(JSON.stringify(state)); online = true; nextSequence = Math.max(nextSequence, state.sequence + 1);
        onSession(session, context);
        if (pending && state.sequence === pending.input.sequence && JSON.stringify(state.command) === JSON.stringify(pending.input) && state.receipt)
          finish(pending, state.receipt, out.frame);
        else if (pending && state.sequence >= pending.input.sequence) { pending = null; onError('Rescue action was superseded. Please try again.'); }
        else if (pending && !pending.sending && clock() >= pending.retryAt) send(pending).catch(() => {});
        return true;
      } catch (error) { if (same(v)) online = false; throw error; }
      finally { if (same(v)) reading = false; }
    };
    const send = async p => {
      const v = version; p.sending = true; p.attempts++;
      try {
        const out = await request('command', p.input, v);
        if (p.result) return p.result;
        if (pending !== p || out.status !== 'ok' || out.sequence !== p.input.sequence || !receipt(out.result)) throw Error('rescue command changed');
        return finish(p, out.result, out.frame);
      } catch (error) { if (p.result) return p.result; if (same(v) && pending === p) { p.sending = false; p.retryAt = clock() + Math.min(30000, 1000 * 2 ** Math.min(5, p.attempts - 1)); } throw error; }
    };
    const command = input => {
      if (disposed || !connection?.accountId || !online || !context || !session || pending || !input || Object.hasOwn(input, 'sequence')) return Promise.reject(Error('rescue command not ready'));
      const p = { input: JSON.parse(JSON.stringify({ ...input, sequence: nextSequence++ })), sending: false, attempts: 0, retryAt: 0 }; pending = p; return send(p);
    };
    const retry = () => pending && !pending.sending ? send(pending) : Promise.reject(Error('no rescue retry pending'));
    const pose = async value => {
      if (disposed || !online || !context || !session?.dog) return false;
      const v = version;
      const out = await request('pose', { context, dog: session.dog.id, pose: value }, v); return out.status === 'accepted';
    };
    return { setConnection, refresh, command, retry, pose,
      update(dt) { if (disposed || !connection || !Number.isFinite(dt) || dt < 0) return; due -= dt;
        if (due <= 0 && !reading) { due = connection.accountId ? 2 : 5; const v = version; refresh().catch(() => { if (same(v)) { onLost(); onError('Shared rescue is reconnecting.'); } }); } },
      dispose() { if (disposed) return; disposed = true; version++; abort(); pending = context = session = null; onLost(); },
      get ready() { return online && !!context; }, get pending() { return !!pending; }, get context() { return context; }, get session() { return session; },
      state: () => ({ ready: online && !!context, pending: !!pending, retryable: !!pending && !pending.sending, context, session }) };
  };
  B.rescueClient = { create };
})();
