// Source of truth for pods and nodes. Subscribes to SSE, emits typed events.
const bus = new EventTarget();
export const events = bus;
export const pods = new Map();   // pod-index -> {name, state, node}
export const nodes = new Map();  // hostname -> {state, ...info}

function fire(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

// Visual scene supports exactly 5 stenciled containers (indices 0-4) matching
// the 5 physical 3D-printed shipping containers on the booth.
const MAX_POD_INDEX = 4;

function handlePodEvent(data) {
  const raw = String(data.index || '');
  if (!raw || raw === 'unknown') return;  // skip pods without statefulset pod-name
  // The K8s "statefulset.kubernetes.io/pod-name" label is the full pod name
  // (e.g. "http-echo-3"). Extract the trailing replica index for visual mapping.
  const m = raw.match(/-(\d+)$/);
  if (!m) {
    console.warn('[state] non-statefulset pod ignored:', raw);
    return;
  }
  const index = parseInt(m[1], 10);
  if (Number.isNaN(index) || index < 0 || index > MAX_POD_INDEX) {
    console.warn('[state] pod index out of range, ignored:', index);
    return;
  }
  const prev = pods.get(index);
  const next = { name: data.name, state: data.status, node: data.node };
  pods.set(index, next);

  if (!prev) {
    fire('pod:appeared', { index, ...next });
  } else if (prev.state !== next.state) {
    fire(`pod:${next.state.toLowerCase()}`, { index, prev: prev.state, ...next });
  } else if (prev.node !== next.node) {
    fire('pod:moved', { index, prevNode: prev.node, ...next });
  }
}

function handleNodeEvent(data) {
  const name = data.name;
  const prev = nodes.get(name);
  const next = {
    state: data.status,
    kubeletVersion: data.kubeletVersion,
    architecture: data.architecture,
    osImage: data.osImage,
  };
  nodes.set(name, next);

  if (!prev) {
    fire('node:joined', { name, ...next });
  } else if (prev.state !== next.state) {
    if (next.state === 'KubeletReady') fire('node:ready', { name, prev: prev.state, ...next });
    else fire('node:notready', { name, prev: prev.state, ...next });
  }
}

// NOTE: We don't reap nodes by lastSeen — K8s doesn't emit periodic events for
// stable nodes, so a "no events in 60s" rule would falsely sink healthy ships.
// Node-gone is currently only triggered explicitly (not yet wired to backend).

export const mode = { value: 'day' };

function handleModeEvent(data) {
  const next = data.mode === 'night' ? 'night' : 'day';
  if (next === mode.value) return;
  mode.value = next;
  fire('mode:change', { mode: next });
}

export function init() {
  const podsES = new EventSource('/stream_pods');
  podsES.onmessage = e => {
    try {
      const data = JSON.parse(e.data.replaceAll("'", '"'));
      handlePodEvent(data);
    } catch (err) { console.error('[state] pod parse', err, e.data); }
  };
  podsES.onerror = err => console.warn('[state] pods SSE error', err);

  const nodesES = new EventSource('/stream_nodes');
  nodesES.onmessage = e => {
    try {
      const data = JSON.parse(e.data.replaceAll("'", '"'));
      handleNodeEvent(data);
    } catch (err) { console.error('[state] node parse', err, e.data); }
  };
  nodesES.onerror = err => console.warn('[state] nodes SSE error', err);

  const modeES = new EventSource('/stream_mode');
  modeES.onmessage = e => {
    try {
      const data = JSON.parse(e.data.replaceAll("'", '"'));
      handleModeEvent(data);
    } catch (err) { console.error('[state] mode parse', err, e.data); }
  };
  modeES.onerror = err => console.warn('[state] mode SSE error', err);

  console.log('[state] SSE subscribed');
}
