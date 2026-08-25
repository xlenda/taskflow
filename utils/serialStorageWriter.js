const noop = () => {};

export function createSerialStorageWriter({ write, timeoutMs = 6000, onStatus = noop } = {}) {
  if (typeof write !== 'function') throw new Error('storage_write_required');

  let disposed = false;
  let paused = false;
  let revision = 0;
  let ackedRevision = 0;
  let inFlight = null;
  let queued = null;
  const waiters = new Set();

  const status = (type, details = {}) => {
    if (disposed) return;
    try {
      onStatus({ type, ...details });
    } catch (_error) {}
  };

  const settleWaiter = (waiter, value) => {
    if (!waiters.has(waiter)) return;
    waiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(value);
  };

  const settleAcknowledged = () => {
    [...waiters].forEach((waiter) => {
      if (waiter.revision <= ackedRevision) settleWaiter(waiter, true);
    });
  };

  const settleFailed = () => {
    [...waiters].forEach((waiter) => settleWaiter(waiter, false));
  };

  const pump = () => {
    if (disposed || paused || inFlight || !queued) return;

    const job = queued;
    queued = null;
    const token = { job, timer: null };
    inFlight = token;

    let operation;
    try {
      operation = Promise.resolve(write(job.value));
    } catch (error) {
      operation = Promise.reject(error);
    }

    token.timer = setTimeout(() => {
      if (disposed || inFlight !== token) return;
      status('timeout', { revision: job.revision });
    }, Math.max(1, timeoutMs));

    operation.then(
      () => {
        if (disposed || inFlight !== token) return;
        clearTimeout(token.timer);
        inFlight = null;
        ackedRevision = Math.max(ackedRevision, job.revision);
        settleAcknowledged();
        status('ok', { revision: job.revision, pending: !!queued });
        pump();
      },
      () => {
        if (disposed || inFlight !== token) return;
        clearTimeout(token.timer);
        inFlight = null;
        paused = true;
        if (!queued || queued.revision < job.revision) queued = job;
        settleFailed();
        status('failed', { revision: job.revision });
      }
    );
  };

  const enqueue = (value) => {
    if (disposed) return 0;
    revision += 1;
    queued = { revision, value };
    pump();
    return revision;
  };

  const waitFor = (targetRevision, waitMs = timeoutMs) => {
    if (!targetRevision || disposed) return Promise.resolve(false);
    if (ackedRevision >= targetRevision) return Promise.resolve(true);

    return new Promise((resolve) => {
      const waiter = {
        revision: targetRevision,
        resolve,
        timer: null,
      };
      waiter.timer = setTimeout(
        () => settleWaiter(waiter, false),
        Math.max(1, waitMs)
      );
      waiters.add(waiter);
      if (ackedRevision >= targetRevision) settleWaiter(waiter, true);
    });
  };

  const resume = () => {
    if (disposed) return;
    paused = false;
    pump();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (inFlight && inFlight.timer) clearTimeout(inFlight.timer);
    settleFailed();
    inFlight = null;
    queued = null;
  };

  const inspect = () => ({
    revision,
    ackedRevision,
    inFlightRevision: inFlight ? inFlight.job.revision : null,
    queuedRevision: queued ? queued.revision : null,
    paused,
    disposed,
  });

  return { enqueue, waitFor, resume, dispose, inspect };
}
