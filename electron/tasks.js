'use strict';

const crypto = require('crypto');

class Task {
  constructor(manager, { kind, title, worker }) {
    this.manager = manager;
    this.id = crypto.randomUUID();
    this.kind = kind;
    this.title = title;
    this.worker = worker;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.cancelled = false;
    this.paused = false;
    this.startedAt = Date.now();
    this.lastEmit = 0;
    this.cleanup = null;
    this.percent = 0;
    this.stage = '准备中';
    this.detail = '';
    this.runId = 0;
  }

  report(patch = {}, force = false) {
    if (this.cancelled && !force) return;
    if (Number.isFinite(patch.percent)) this.percent = Math.max(this.percent, Math.min(100, patch.percent));
    if (patch.stage) this.stage = patch.stage;
    if (patch.detail !== undefined) this.detail = patch.detail;
    const now = Date.now();
    if (!force && now - this.lastEmit < 120) return;
    this.lastEmit = now;
    this.manager.emit('task:progress', {
      id: this.id,
      kind: this.kind,
      title: this.title,
      percent: Math.round(this.percent * 10) / 10,
      stage: this.stage,
      detail: this.detail,
      elapsed: now - this.startedAt,
      status: 'running',
    });
  }

  setCancelHandler(fn) {
    this.cleanup = fn;
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.paused = false;
    this.controller.abort();
    if (typeof this.cleanup === 'function') {
      try {
        this.cleanup();
      } catch {
        // ignore
      }
    }
    this.manager.emit('task:cancelled', {
      id: this.id,
      kind: this.kind,
      title: this.title,
      status: 'cancelled',
    });
    this.manager.tasks.delete(this.id);
  }

  pause() {
    if (this.cancelled || this.paused) return { ok: false };
    this.paused = true;
    this.controller.abort();
    this.manager.emit('task:paused', {
      id: this.id,
      kind: this.kind,
      title: this.title,
      percent: this.percent,
      status: 'paused',
    });
    return { ok: true };
  }

  resume() {
    if (!this.paused || this.cancelled) return { ok: false };
    this.paused = false;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.run();
    return { ok: true };
  }

  async run() {
    const runId = ++this.runId;
    this.report({ percent: this.percent, stage: this.stage || '准备中', detail: this.detail || '' }, true);
    try {
      const result = await this.worker(this);
      if (runId !== this.runId || this.cancelled || this.paused) return;
      this.report({ percent: 100, stage: '完成', detail: '' }, true);
      this.manager.emit('task:done', {
        id: this.id,
        kind: this.kind,
        title: this.title,
        result,
        status: 'done',
        elapsed: Date.now() - this.startedAt,
      });
    } catch (error) {
      if (runId !== this.runId) return;
      if (this.paused) return;
      if (this.cancelled || error.cancelled) {
        if (!this.cancelled) {
          this.cancelled = true;
          this.manager.emit('task:cancelled', { id: this.id, kind: this.kind, title: this.title, status: 'cancelled' });
        }
        return;
      }
      this.manager.emit('task:error', {
        id: this.id,
        kind: this.kind,
        title: this.title,
        error: error.message || '未知错误',
        code: error.code || '',
        status: 'error',
      });
    } finally {
      if (runId === this.runId && !this.paused) this.manager.tasks.delete(this.id);
    }
  }
}

class TaskManager {
  constructor(emit) {
    this.emit = emit;
    this.tasks = new Map();
  }

  start(options) {
    const task = new Task(this, options);
    this.tasks.set(task.id, task);
    task.run();
    return { id: task.id };
  }

  cancel(id) {
    const task = this.tasks.get(id);
    if (task) task.cancel();
    return { ok: Boolean(task) };
  }

  pause(id) {
    const task = this.tasks.get(id);
    return task ? task.pause() : { ok: false };
  }

  resume(id) {
    const task = this.tasks.get(id);
    return task ? task.resume() : { ok: false };
  }

  cancelAll() {
    for (const task of [...this.tasks.values()]) task.cancel();
  }
}

module.exports = { TaskManager };
