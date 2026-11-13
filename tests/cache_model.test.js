// Checks for the L1 cache model. Run with: node tests/cache_model.test.js
const assert = require('assert');
const path = require('path');
const { simulate } = require(path.join(__dirname, '..', 'cache_model.js'));

const base = { arraySize: 1000, loopIterations: 1000, threadCount: 1, cacheLineSize: 64 };
const run = (code, params) => simulate(code, { ...base, ...params });
let passed = 0;
function test(name, fn) {
    fn();
    passed++;
    console.log('ok  ' + name);
}

// 4-byte ints read with a stride of 4 elements: 16 bytes apart.
const strided = `
const int N = 65536;
int a[N];
int main() {
    long sum = 0;
    for (int i = 0; i < N; i += 4) {
        sum += a[i];
    }
    return 0;
}`;

test('strided loop: misses follow the cache line size', () => {
    const misses = [16, 32, 64, 128].map(ls => run(strided, { cacheLineSize: ls }).lines[7].misses);
    // 16384 accesses; one miss per line touched
    assert.deepStrictEqual(misses, [16384, 8192, 4096, 2048]);
});

test('strided loop: cost falls as the line size grows', () => {
    const cost = [16, 64].map(ls => run(strided, { cacheLineSize: ls }).lines[7].latency);
    assert.ok(cost[1] < cost[0] / 3, `expected a large drop, got ${cost}`);
});

test('a line size that is not a power of two is rounded', () => {
    const r = run(strided, { cacheLineSize: 60 });
    assert.strictEqual(r.summary.lineSize, 64);
});

// An array whose size the code does not give has Array Size elements.
const param = `
void scale(std::vector<float>& v) {
    for (size_t i = 0; i < v.size(); i++) {
        v[i] *= 2.0f;
    }
}`;

test('Array Size sets the length of arrays the code does not size', () => {
    const small = run(param, { arraySize: 1000 }).lines[4];
    const big = run(param, { arraySize: 100000 }).lines[4];
    assert.strictEqual(small.accesses, 1000);
    assert.strictEqual(big.accesses, 100000);
    assert.strictEqual(big.misses, 100000 / 16);
});

// Reading the same array twice: the second pass hits only if it fits in L1.
const twoPasses = `
void twice(std::vector<int>& v) {
    long s = 0;
    for (int i = 0; i < v.size(); i++) s += v[i];
    for (int i = 0; i < v.size(); i++) s += v[i];
}`;

test('second pass hits when the array fits in 32 KiB and misses when it does not', () => {
    const fits = run(twoPasses, { arraySize: 4096 }).lines[5];      // 16 KiB
    const spills = run(twoPasses, { arraySize: 65536 }).lines[5];   // 256 KiB
    assert.strictEqual(fits.misses, 0);
    assert.strictEqual(spills.misses, 65536 / 16);
    assert.strictEqual(spills.capacity, 65536 / 16);
});

// Column-order walk over a row-major matrix.
const columns = `
const int N = 512;
int m[N][N];
int main() {
    long s = 0;
    for (int j = 0; j < N; j++)
        for (int i = 0; i < N; i++)
            s += m[i][j];
}`;
const rows = columns.replace('s += m[i][j]', 's += m[j][i]');

test('walking a matrix by columns misses far more than by rows', () => {
    const c = run(columns).summary.misses;
    const r = run(rows).summary.misses;
    assert.strictEqual(r, 512 * 512 / 16);
    assert.ok(c > 10 * r, `columns ${c}, rows ${r}`);
});

// Each thread bumps its own counter. Unpadded counters share a cache line.
const counters = `
int counts[64];
void work(int thread_id) {
    for (int i = 0; i < 1000; i++) {
        counts[thread_id] += 1;
    }
}`;
const padded = counters.replace('counts[thread_id]', 'counts[thread_id * 16]');

test('Thread Count: counters in one cache line cause coherence misses', () => {
    const one = run(counters, { threadCount: 1 }).lines[5];
    const four = run(counters, { threadCount: 4 }).lines[5];
    const fourPadded = run(padded, { threadCount: 4 }).lines[5];
    assert.strictEqual(one.misses, 1);
    assert.ok(four.coherence > 3000, `coherence misses ${four.coherence}`);
    assert.strictEqual(fourPadded.coherence, 0);
    assert.strictEqual(fourPadded.misses, 4);
});

test('Thread Count splits an outer loop between threads', () => {
    const r = run(strided, { threadCount: 4 });
    assert.strictEqual(r.loops[6].iterations, 16384);
    assert.strictEqual(r.loops[6].slowestThread, 4096);
    assert.ok(r.lines[7].latency < run(strided).lines[7].latency / 3);
});

test('Loop Iterations sets the trip count of while loops', () => {
    const code = `
int a[100000];
int main() {
    int i = 0;
    while (keep_going()) {
        a[i] = 1;
        i++;
    }
}`;
    assert.strictEqual(run(code, { loopIterations: 500 }).lines[6].accesses, 500);
    assert.strictEqual(run(code, { loopIterations: 2000 }).lines[6].accesses, 2000);
});

console.log(`${passed} passed`);
