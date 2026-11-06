/* wt-alarm-worker.js - one tick per second for the WorkTrack alarm (CodeFlow 4.5.0, W5c).
   Ordinary page timers are slowed in background tabs; a dedicated worker's timer is not. It holds no data and does nothing but count. */
let t = 0;
onmessage = e => {
  if (e.data === 'start' && !t) t = setInterval(() => postMessage(1), 1000);
  else if (e.data === 'stop') { clearInterval(t); t = 0; }
};
