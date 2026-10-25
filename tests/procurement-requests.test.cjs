const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/procurement/_components/ui.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Small dependency-injected hook host. It runs the production hook without a DOM;
// tests control request completion order, effect cleanup, and the network clock.
function createHost(fetcher) {
  const slots = [], pendingEffects = [], timers = new Map();
  let cursor = 0, timerId = 0, currentUrl = null, keep = false, result;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: null };
        pendingEffects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const loaded = { exports: {} };
  const localRequire = name => name === 'react' ? hooks
    : name === 'next/link' ? { default: () => null }
    : name === 'next/navigation' ? { useSearchParams: () => new URLSearchParams() }
    : name === 'lucide-react' ? {} : require(name);
  new Function('module', 'exports', 'require', 'fetch', 'setTimeout', 'clearTimeout', compiled)(
    loaded, loaded.exports, localRequire, fetcher,
    (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    id => timers.delete(id),
  );
  return {
    api: loaded.exports,
    render(url = currentUrl, retain = keep) {
      currentUrl = url; keep = retain; cursor = 0;
      result = loaded.exports.useJson(url, retain);
      while (pendingEffects.length) pendingEffects.shift()();
      return result;
    },
    timeout() {
      for (const timer of [...timers.values()]) {
        assert.equal(timer.delay, 30_000);
        timer.fn();
      }
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get timerCount() { return timers.size; },
  };
}

test('same-query retry recovers from a server error and immediately shows loading', async () => {
  let calls = 0;
  const host = createHost(async () => ++calls === 1 ? json({ error: 'ลองใหม่' }, 503) : json({ total: 7 }));
  assert.equal(host.render('/search?q=training').loading, true);
  await flush();
  const failed = host.render();
  assert.equal(failed.error.status, 503);
  assert.equal(failed.loading, false);
  const retry = failed.refetch;
  retry();
  const pending = host.render();
  assert.equal(pending.error, null);
  assert.equal(pending.loading, true);
  assert.equal(pending.refetch, retry, 'retry callback is stable across renders');
  await flush();
  assert.deepEqual(host.render().data, { total: 7 });
  assert.equal(calls, 2);
  assert.equal(host.timerCount, 0);
  host.unmount();
});

test('superseded requests are aborted and late responses cannot replace newer results', async () => {
  const requests = [];
  const host = createHost((url, init) => {
    const request = { url, signal: init.signal, ...deferred() };
    requests.push(request);
    return request.promise;
  });
  host.render('/search?q=old');
  host.render('/search?q=new');
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(json({ value: 'new' }));
  await flush();
  assert.deepEqual(host.render().data, { value: 'new' });
  requests[0].resolve(json({ value: 'old' }));
  await flush();
  assert.deepEqual(host.render().data, { value: 'new' });
  host.unmount();
});

test('returning to an earlier URL still represents a new pending request', async () => {
  const requests = [];
  const host = createHost(() => {
    const request = deferred(); requests.push(request); return request.promise;
  });
  host.render('/search?q=A');
  requests[0].resolve(json({ total: 1 }));
  await flush();
  assert.deepEqual(host.render().data, { total: 1 });
  host.render('/search?q=B');
  const returning = host.render('/search?q=A');
  assert.equal(returning.loading, true);
  assert.equal(returning.data, null, 'previous A result must not masquerade as a completed new request');
  assert.equal(requests.length, 3);
  requests[2].resolve(json({ total: 2 }));
  await flush();
  assert.deepEqual(host.render().data, { total: 2 });
  host.unmount();
});

test('keep retains results during a retry, while null URL is idle and aborts pending work', async () => {
  const requests = [];
  const host = createHost((url, init) => {
    const request = { signal: init.signal, ...deferred() }; requests.push(request); return request.promise;
  });
  host.render('/vendors', true);
  requests[0].resolve(json({ vendors: ['A'] }));
  await flush();
  host.render().refetch();
  const refreshing = host.render();
  assert.deepEqual(refreshing.data, { vendors: ['A'] });
  assert.equal(refreshing.loading, true);
  assert.deepEqual(host.render(null, false), { data: null, error: null, loading: false, refetch: refreshing.refetch });
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(host.timerCount, 0);
  host.unmount();
});

test('network timeout becomes retryable even when fetch ignores cancellation', async () => {
  const request = deferred();
  let signal;
  const host = createHost((url, init) => { signal = init.signal; return request.promise; });
  host.render('/slow');
  host.timeout();
  const timedOut = host.render();
  assert.equal(timedOut.loading, false);
  assert.equal(timedOut.error.status, 408);
  assert.equal(signal.aborted, true);
  request.resolve(json({ stale: true }));
  await flush();
  assert.equal(host.render().data, null);
  assert.equal(host.render().error.status, 408);
  host.unmount();
});

test('unmount aborts the active request and clears its timeout', () => {
  let signal;
  const host = createHost((url, init) => { signal = init.signal; return new Promise(() => {}); });
  host.render('/pending');
  host.unmount();
  assert.equal(signal.aborted, true);
  assert.equal(host.timerCount, 0);
});

test('error panel retries recoverable failures but does not offer retry for denied access', () => {
  const { api } = createHost(() => {});
  const retry = () => {};
  for (const status of [0, 408, 429, 500, 503]) {
    const panel = api.ErrorBox({ error: new api.FetchError('failed', status), onRetry: retry });
    const button = panel.props.children.find(child => child?.type === 'button');
    assert.equal(button.props.children, 'ลองอีกครั้ง');
    assert.equal(button.props.onClick, retry);
  }
  const denied = api.ErrorBox({ error: new api.FetchError('no access', 403), onRetry: retry });
  assert.equal(denied.props.children.some(child => child?.type === 'button'), false);
});
