export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  const workers: Promise<void>[] = [];
  const actual = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < actual; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
