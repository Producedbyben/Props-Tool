class TaskQueue {
  constructor(limit = 2) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }

  push(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    if (this.running >= this.limit || this.queue.length === 0) return;
    const item = this.queue.shift();
    this.running += 1;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        this.running -= 1;
        this._drain();
      });
  }
}

module.exports = TaskQueue;
