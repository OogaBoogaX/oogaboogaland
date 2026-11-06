// Compose source-owned body adapters in ONE host transaction. No admission,
// scheduler, world selection or activation; the trusted world supplies adapters.
import { HOST } from './virtual-host.js';
import { BODY_STORAGE } from './host-body-storage.js';
const kinds = ['ooga', 'clanker'];
const kindOf = row => row?.kind ?? row?.body?.kind;
const records = host => [...(host?.sessions?.sessions || []), ...(host?.sessions?.pending || [])];
const fail = () => { throw Error('invalid mixed body session adapter'); };
const subset = (host, kind) => !host?.sessions ? host : { ...host, sessions: { ...host.sessions,
  sessions: host.sessions.sessions.filter(row => kindOf(row) === kind),
  pending: host.sessions.pending.filter(row => kindOf(row) === kind) } };

export function createMixedBodySessions(adapters) {
  if (!adapters || Object.keys(adapters).sort().join() !== 'clanker,ooga'
    || kinds.some(kind => typeof adapters[kind]?.forTransaction !== 'function')) fail();
  // Never increase either source adapter's operation budget. The shared
  // operation object also retains Clanker construction debt across retries.
  const passiveSteps = Math.min(...kinds.map(kind => adapters[kind].passiveSteps ?? HOST.passiveSteps));
  if (!Number.isSafeInteger(passiveSteps) || passiveSteps < 1 || passiveSteps > HOST.passiveSteps) fail();
  return {
    passiveSteps, stepPassive: fail,
    async forTransaction(tx, operation = {}) {
      if (typeof tx?.bodies !== 'function' || typeof tx.captureBodies !== 'function') fail();
      const host = await tx.get(HOST.key), bodies = await tx.bodies(), known = new Map();
      const initial = records(host);
      if (initial.length > BODY_STORAGE.maxBodies || bodies.length !== initial.length) fail();
      for (const row of initial) {
        if (!kinds.includes(kindOf(row)) || known.has(row.bodyId)) fail();
        known.set(row.bodyId, kindOf(row));
      }
      const scoped = new Map(), captures = new Map(); let closed = false, poisoned = false;
      const ready = () => { if (closed || poisoned) fail(); };
      const dispose = () => {
        if (closed) return; closed = true;
        let error;
        for (const child of scoped.values()) { try { child.dispose(); } catch (caught) { error ||= caught; } }
        scoped.clear(); captures.clear(); known.clear();
        if (error) throw error;
      };
      try {
        for (const kind of kinds) {
          const childTx = Object.create(tx);
          childTx.get = async key => key === HOST.key ? structuredClone(subset(host, kind)) : tx.get(key);
          childTx.bodies = async () => structuredClone(bodies.filter(row => row.kind === kind));
          childTx.captureBodies = capture => {
            if (captures.has(kind) || typeof capture !== 'function') fail();
            captures.set(kind, capture);
          };
          const child = await adapters[kind].forTransaction(childTx, operation);
          // Save a usable disposer before checking the rest, so partial startup
          // releases every constructed controller even on a contract failure.
          if (typeof child?.dispose === 'function') scoped.set(kind, child);
          if (!child || child === adapters[kind] || !captures.has(kind)
            || ['stepPassive', 'readMovement', 'applyMovement', 'transfer', 'dispose'].some(k => typeof child[k] !== 'function')) fail();
        }
        tx.captureBodies(next => {
          ready();
          try {
            const rows = records(next), expected = new Map();
            if (rows.length > BODY_STORAGE.maxBodies) fail();
            for (const row of rows) {
              if (!kinds.includes(kindOf(row)) || expected.has(row.bodyId)) fail();
              expected.set(row.bodyId, row);
            }
            const result = [], seen = new Set();
            for (const kind of kinds) {
              const captured = captures.get(kind)(subset(next, kind));
              if (!Array.isArray(captured) || captured.length > BODY_STORAGE.maxBodies) fail();
              for (const body of captured) {
                const row = expected.get(body?.bodyId);
                if (!row || kindOf(row) !== kind || body.kind !== kind || seen.has(body.bodyId)
                  || body.accountId !== row.accountId || body.generation !== row.generation) fail();
                seen.add(body.bodyId); result.push(body);
              }
            }
            if (seen.size !== expected.size) fail();
            return result.sort((a, b) => a.generation - b.generation);
          } catch (error) { poisoned = true; throw error; }
        });
      } catch (error) { try { dispose(); } finally { throw error; } }
      const call = (method, row, args, fallback) => {
        ready(); const kind = kindOf(row) ?? known.get(row?.bodyId), child = scoped.get(kind);
        if (!child) fail();
        if (typeof child[method] !== 'function') return fallback;
        try { return child[method](row, ...args); }
        catch (error) { poisoned = true; throw error; }
      };
      return { passiveSteps, dispose,
        stepPassive: (...args) => call('stepPassive', args[0], args.slice(1)),
        canStep: row => call('canStep', row, [], true),
        validateOccupancy: (...args) => call('validateOccupancy', args[0], args.slice(1), false),
        readMovement: (row, input) => call('readMovement', row, [input]),
        applyMovement: (row, candidate) => call('applyMovement', row, [candidate]),
        transfer: (row, checkpoint) => call('transfer', row, [checkpoint]),
      };
    },
  };
}
