// L1 cache model for the analyzer.
//
// The analyzer reads the C++ in the editor, finds the arrays, the loops and
// the array accesses inside them, runs the loops, and sends the address of
// every access through a model of an L1 data cache. Each line then gets real
// hit and miss counts, and its cost is hits * 1 ns + misses * 100 ns.
//
// The cache: 32 KiB, 8-way set associative, least recently used (LRU)
// replacement. Cache Line Size sets the line size, so the number of sets is
// 32768 / (line size * 8). Each thread has its own L1. A write by one thread
// removes that line from the other threads' caches (as in MESI), so threads
// that write to the same line keep missing (false sharing).
//
// What it runs:
// - for loops with any start, condition and step it can evaluate. If the
//   condition uses a value it cannot work out, the loop runs Loop Iterations
//   times. while and do loops always run Loop Iterations times.
// - if statements: the condition's accesses are counted and the body always
//   runs. else branches are skipped.
// - every function body runs once, top to bottom. Calls are not followed.
// - integer variables assigned from expressions it can evaluate, such as
//   int idx = (i * 7) % n;
//
// Arrays: C arrays, std::array, std::vector (and vector of vector), and
// new T[n]. An array whose size cannot be worked out (a function parameter,
// for example) has Array Size elements. Arrays sit one after another in
// memory, each starting on a 64-byte boundary.
//
// Threads: Thread Count splits the outermost loop of each function into equal
// contiguous chunks, like OpenMP's "parallel for" with a static schedule. The
// threads take turns one iteration at a time. If a function uses a variable
// named thread_id, tid, threadId or thread_idx, every thread runs the whole
// function instead, with that variable set to its thread number.
(function (root) {
    'use strict';

    const L1_SIZE_BYTES = 32 * 1024;
    const L1_WAYS = 8;
    const HIT_NS = 1;
    const MISS_NS = 100;
    const MAX_ACCESSES = 5000000;
    const MAX_STEPS = 20000000;
    const ARRAY_ALIGN = 64;
    const THREAD_ID_NAMES = ['thread_id', 'tid', 'threadId', 'thread_idx'];

    // ---------------------------------------------------------------- cache

    class L1Cache {
        constructor(lineSize, sizeBytes = L1_SIZE_BYTES, ways = L1_WAYS) {
            this.lineSize = lineSize;
            this.sizeBytes = sizeBytes;
            const lines = Math.max(1, Math.floor(sizeBytes / lineSize));
            this.ways = Math.min(ways, lines);
            this.numSets = Math.max(1, Math.floor(lines / this.ways));
            this.sets = Array.from({ length: this.numSets }, () => []);
            this.seen = new Set();
            this.invalidated = new Set();
        }

        lineOf(addr) {
            return Math.floor(addr / this.lineSize);
        }

        // Returns 'hit', 'cold', 'coherence' or 'capacity' (capacity and
        // conflict misses together: the line was here before and was evicted).
        access(line) {
            const set = this.sets[line % this.numSets];
            const idx = set.indexOf(line);
            if (idx >= 0) {
                if (idx !== set.length - 1) {
                    set.splice(idx, 1);
                    set.push(line);
                }
                return 'hit';
            }
            if (set.length >= this.ways) set.shift();
            set.push(line);
            if (!this.seen.has(line)) {
                this.seen.add(line);
                return 'cold';
            }
            if (this.invalidated.delete(line)) return 'coherence';
            return 'capacity';
        }

        invalidate(line) {
            const set = this.sets[line % this.numSets];
            const idx = set.indexOf(line);
            if (idx >= 0) {
                set.splice(idx, 1);
                this.invalidated.add(line);
                return true;
            }
            return false;
        }
    }

    // ------------------------------------------------------------ tokenizer

    const PUNCT = ['<<=', '>>=', '...', '::', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=',
        '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];
    const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^=']);

    function tokenize(code) {
        const toks = [];
        const defines = {};
        let i = 0, line = 1, lineStart = true;
        const n = code.length;
        while (i < n) {
            const c = code[i];
            if (c === '\n') { line++; i++; lineStart = true; continue; }
            if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
            if (c === '#' && lineStart) {
                let j = i;
                while (j < n && code[j] !== '\n') {
                    if (code[j] === '\\' && code[j + 1] === '\n') { j += 2; line++; continue; }
                    j++;
                }
                const m = code.slice(i, j).match(/^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/);
                if (m) defines[m[1]] = tokenize(m[2].replace(/\/\/.*$/, '')).toks;
                i = j;
                continue;
            }
            lineStart = false;
            if (c === '/' && code[i + 1] === '/') {
                while (i < n && code[i] !== '\n') i++;
                continue;
            }
            if (c === '/' && code[i + 1] === '*') {
                i += 2;
                while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; }
                i += 2;
                continue;
            }
            if (c === '"' || c === "'") {
                let j = i + 1;
                while (j < n && code[j] !== c && code[j] !== '\n') { if (code[j] === '\\') j++; j++; }
                toks.push({ t: 'str', v: code.slice(i, j + 1), line });
                i = j + 1;
                continue;
            }
            const num = /^(0[xX][0-9a-fA-F']+|0[bB][01']+|(\d[\d']*\.?\d*|\.\d+)([eE][+-]?\d+)?)[uUlLfF]*/.exec(code.slice(i, i + 40));
            if (num && /[\d.]/.test(c) && (c !== '.' || /\d/.test(code[i + 1]))) {
                const raw = num[1].replace(/'/g, '');
                let v;
                if (/^0[xX]/.test(raw)) v = parseInt(raw, 16);
                else if (/^0[bB]/.test(raw)) v = parseInt(raw.slice(2), 2);
                else v = Number(raw);
                toks.push({ t: 'num', v, line });
                i += num[0].length;
                continue;
            }
            const id = /^[A-Za-z_]\w*/.exec(code.slice(i, i + 256));
            if (id) {
                toks.push({ t: 'id', v: id[0], line });
                i += id[0].length;
                continue;
            }
            const p = PUNCT.find(s => code.startsWith(s, i)) || c;
            toks.push({ t: 'p', v: p, line });
            i += p.length;
        }
        return { toks, defines };
    }

    // --------------------------------------------------------- expressions

    class Unknown extends Error {}

    // Compiles a token list into a function of (env, ctx) that returns a
    // number, or throws Unknown when a value cannot be worked out.
    function compileExpr(toks, model) {
        let pos = 0;
        const peek = (k = 0) => toks[pos + k];
        const isP = (v, k = 0) => peek(k) && peek(k).t === 'p' && peek(k).v === v;
        const isId = (v, k = 0) => peek(k) && peek(k).t === 'id' && peek(k).v === v;
        const fail = () => { throw new Unknown('cannot parse'); };
        const BIN = [
            ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']
        ];

        function ternary() {
            const c = binary(0);
            if (isP('?')) {
                pos++;
                const a = ternary();
                if (!isP(':')) fail();
                pos++;
                const b = ternary();
                return (e, x) => (c(e, x) ? a(e, x) : b(e, x));
            }
            return c;
        }

        function binary(level) {
            if (level >= BIN.length) return unary();
            let left = binary(level + 1);
            while (peek() && peek().t === 'p' && BIN[level].includes(peek().v)) {
                const op = peek().v;
                pos++;
                const l = left, r = binary(level + 1);
                left = makeBin(op, l, r);
            }
            return left;
        }

        function makeBin(op, l, r) {
            switch (op) {
                case '+': return (e, x) => l(e, x) + r(e, x);
                case '-': return (e, x) => l(e, x) - r(e, x);
                case '*': return (e, x) => l(e, x) * r(e, x);
                case '/': return (e, x) => {
                    const a = l(e, x), b = r(e, x);
                    if (b === 0) throw new Unknown('divide by zero');
                    const q = a / b;
                    return Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(q) : q;
                };
                case '%': return (e, x) => {
                    const b = r(e, x);
                    if (b === 0) throw new Unknown('divide by zero');
                    return l(e, x) % b;
                };
                case '<<': return (e, x) => l(e, x) * Math.pow(2, r(e, x));
                case '>>': return (e, x) => Math.floor(l(e, x) / Math.pow(2, r(e, x)));
                case '<': return (e, x) => +(l(e, x) < r(e, x));
                case '>': return (e, x) => +(l(e, x) > r(e, x));
                case '<=': return (e, x) => +(l(e, x) <= r(e, x));
                case '>=': return (e, x) => +(l(e, x) >= r(e, x));
                case '==': return (e, x) => +(l(e, x) === r(e, x));
                case '!=': return (e, x) => +(l(e, x) !== r(e, x));
                case '&&': return (e, x) => +(!!l(e, x) && !!r(e, x));
                case '||': return (e, x) => +(!!l(e, x) || !!r(e, x));
                case '&': return (e, x) => l(e, x) & r(e, x);
                case '|': return (e, x) => l(e, x) | r(e, x);
                case '^': return (e, x) => l(e, x) ^ r(e, x);
            }
            return fail();
        }

        function unary() {
            if (isP('-')) { pos++; const a = unary(); return (e, x) => -a(e, x); }
            if (isP('+')) { pos++; return unary(); }
            if (isP('!')) { pos++; const a = unary(); return (e, x) => +!a(e, x); }
            if (isP('~')) { pos++; const a = unary(); return (e, x) => ~a(e, x); }
            // C-style cast such as (size_t)x or (int)(a / b)
            if (isP('(') && peek(1) && peek(1).t === 'id' && isTypeName(peek(1).v)) {
                let k = 1;
                while (peek(k) && (peek(k).t === 'id' || isP('::', k) || isP('*', k))) k++;
                if (isP(')', k)) { pos += k + 1; return unary(); }
            }
            return postfix();
        }

        function postfix() {
            const t = peek();
            if (!t) fail();
            if (t.t === 'num') { pos++; const v = t.v; return () => v; }
            if (isP('(')) {
                pos++;
                const a = ternary();
                if (!isP(')')) fail();
                pos++;
                return a;
            }
            if (t.t === 'id') {
                // static_cast<T>(x)
                if (/_cast$/.test(t.v) && isP('<', 1)) {
                    pos += 2;
                    while (peek() && !isP('>')) pos++;
                    pos++;
                    if (!isP('(')) fail();
                    pos++;
                    const a = ternary();
                    if (!isP(')')) fail();
                    pos++;
                    return a;
                }
                if (t.v === 'sizeof' && isP('(', 1)) {
                    pos += 2;
                    const start = pos;
                    let depth = 1;
                    while (peek() && depth) { if (isP('(')) depth++; if (isP(')')) depth--; pos++; }
                    const inner = toks.slice(start, pos - 1).map(z => z.v);
                    const size = elemSizeOf(inner);
                    return () => size;
                }
                pos++;
                let name = t.v;
                // std::something or Class::member: use the last name
                while (isP('::') && peek(1) && peek(1).t === 'id') { pos++; name = peek().v; pos++; }
                // v.size() or v.length()
                if ((isP('.') || isP('->')) && peek(1) && peek(1).t === 'id' && ['size', 'length'].includes(peek(1).v) && isP('(', 2) && isP(')', 3)) {
                    pos += 4;
                    return () => model.arrayLength(name);
                }
                if (isP('(') || isP('[') || isP('.') || isP('->')) throw new Unknown('call or element');
                return (e) => {
                    const v = e[name];
                    if (typeof v === 'number') return v;
                    throw new Unknown(name);
                };
            }
            return fail();
        }

        const fn = ternary();
        if (pos !== toks.length) fail();
        return fn;
    }

    function tryCompile(toks, model) {
        try { return compileExpr(toks, model); } catch (e) { return null; }
    }

    // ------------------------------------------------------ type helpers

    const TYPE_WORDS = new Set(['int', 'long', 'short', 'char', 'float', 'double', 'bool', 'unsigned', 'signed',
        'size_t', 'ssize_t', 'ptrdiff_t', 'auto', 'const', 'static', 'volatile', 'register', 'constexpr', 'std',
        'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'void',
        'vector', 'array', 'string', 'atomic']);

    function isTypeName(w) {
        return TYPE_WORDS.has(w) || /_t$/.test(w);
    }

    function elemSizeOf(words) {
        const s = words.join(' ');
        if (/\*/.test(s)) return 8;
        if (/\b(double|int64_t|uint64_t|size_t|ssize_t|ptrdiff_t|long\s+long|long)\b/.test(s)) return 8;
        if (/\b(char|bool|int8_t|uint8_t)\b/.test(s)) return 1;
        if (/\b(short|int16_t|uint16_t)\b/.test(s)) return 2;
        return 4;
    }

    // --------------------------------------------------------------- parser

    // Splits tokens into a tree of functions, blocks, loops and statements.
    function parseProgram(toks) {
        let pos = 0;
        const peek = (k = 0) => toks[pos + k];
        const isP = (v, k = 0) => peek(k) && peek(k).t === 'p' && peek(k).v === v;
        const isId = (v, k = 0) => peek(k) && peek(k).t === 'id' && peek(k).v === v;

        function balanced(open, close) {
            // pos is at `open`; returns the tokens inside, pos after `close`
            const start = ++pos;
            let depth = 1;
            while (pos < toks.length) {
                if (isP(open)) depth++;
                else if (isP(close)) { depth--; if (depth === 0) break; }
                pos++;
            }
            const inner = toks.slice(start, pos);
            pos++;
            return inner;
        }

        function untilSemicolon() {
            const start = pos;
            let depth = 0;
            while (pos < toks.length) {
                if (isP('(') || isP('[') || isP('{')) depth++;
                else if (isP(')') || isP(']') || isP('}')) {
                    if (depth === 0) break;
                    depth--;
                } else if (isP(';') && depth === 0) { pos++; return toks.slice(start, pos - 1); }
                pos++;
            }
            return toks.slice(start, pos);
        }

        function splitTop(list, sep) {
            const parts = [[]];
            let depth = 0;
            for (const t of list) {
                if (t.t === 'p' && ['(', '[', '{'].includes(t.v)) depth++;
                if (t.t === 'p' && [')', ']', '}'].includes(t.v)) depth--;
                if (t.t === 'p' && t.v === sep && depth === 0) parts.push([]);
                else parts[parts.length - 1].push(t);
            }
            return parts;
        }

        function statement() {
            const t = peek();
            if (!t) return null;
            if (isP('{')) {
                pos++;
                const body = [];
                while (pos < toks.length && !isP('}')) {
                    const s = statement();
                    if (s) body.push(s);
                }
                pos++;
                return { type: 'block', body, line: t.line };
            }
            if (isP(';')) { pos++; return null; }
            if (isId('for') && isP('(', 1)) {
                pos++;
                const header = balanced('(', ')');
                const body = statement();
                const parts = splitTop(header, ';');
                if (parts.length === 3) {
                    return { type: 'for', line: t.line, init: parts[0], cond: parts[1], incr: parts[2], body };
                }
                // range-for: for (auto& x : container)
                const colon = header.findIndex(z => z.t === 'p' && z.v === ':');
                const container = colon >= 0 ? header.slice(colon + 1).filter(z => z.t === 'id').pop() : null;
                return { type: 'rangefor', line: t.line, container: container ? container.v : null, body };
            }
            if (isId('while') && isP('(', 1)) {
                pos++;
                const cond = balanced('(', ')');
                const body = statement();
                return { type: 'while', line: t.line, cond, body };
            }
            if (isId('do')) {
                pos++;
                const body = statement();
                let cond = [];
                if (isId('while')) { pos++; if (isP('(')) cond = balanced('(', ')'); if (isP(';')) pos++; }
                return { type: 'while', line: t.line, cond, body };
            }
            if (isId('if') && isP('(', 1)) {
                pos++;
                if (isId('constexpr')) pos++;
                const cond = balanced('(', ')');
                const then = statement();
                if (isId('else')) { pos++; statement(); }
                return { type: 'if', line: t.line, cond, then };
            }
            if (isId('switch') && isP('(', 1)) {
                pos++;
                const cond = balanced('(', ')');
                const body = statement();
                return { type: 'if', line: t.line, cond, then: body };
            }
            if ((isId('case') || isId('default'))) {
                while (pos < toks.length && !isP(':')) pos++;
                pos++;
                return null;
            }
            if (isId('return') || isId('break') || isId('continue')) {
                const toksOf = untilSemicolon().slice(1);
                return { type: 'stmt', line: t.line, toks: toksOf };
            }
            // a lambda or local struct would open a brace here; skip it
            const st = untilSemicolon();
            if (st.length === 0 && isP('}')) return null;
            if (st.length === 0) { pos++; return null; }
            return { type: 'stmt', line: t.line, toks: st };
        }

        // Top level: functions, globals, and type definitions
        const functions = [];
        const globals = [];
        while (pos < toks.length) {
            const t = peek();
            if (isId('struct') || isId('class') || isId('union') || isId('enum')) {
                while (pos < toks.length && !isP('{') && !isP(';')) pos++;
                if (isP('{')) balanced('{', '}');
                if (isP(';')) pos++;
                continue;
            }
            if (isId('namespace')) {
                while (pos < toks.length && !isP('{')) pos++;
                pos++;
                continue;
            }
            if (isId('using') || isId('typedef') || isId('template')) {
                if (isId('template')) { pos++; if (isP('<')) { let d = 0; do { if (isP('<')) d++; if (isP('>')) d--; if (isP('>>')) d -= 2; pos++; } while (pos < toks.length && d > 0); } continue; }
                untilSemicolon();
                continue;
            }
            if (isP('}') || isP(';')) { pos++; continue; }
            // Look ahead for "name ( ... ) [const] {" which starts a function body
            let k = pos, depth = 0, sawParen = false, isFunc = false;
            while (k < toks.length) {
                const z = toks[k];
                if (z.t === 'p' && z.v === '(') { depth++; sawParen = true; }
                else if (z.t === 'p' && z.v === ')') depth--;
                else if (z.t === 'p' && z.v === ';' && depth === 0) break;
                else if (z.t === 'p' && z.v === '{' && depth === 0) {
                    const prev = toks[k - 1];
                    isFunc = sawParen && prev && ((prev.t === 'p' && prev.v === ')') || (prev.t === 'id' && ['const', 'override', 'noexcept'].includes(prev.v)));
                    break;
                } else if (z.t === 'p' && z.v === '=' && depth === 0 && !sawParen) break;
                k++;
            }
            if (isFunc) {
                const header = toks.slice(pos, k);
                const nameTok = header[header.findIndex(z => z.t === 'p' && z.v === '(') - 1];
                pos = k;
                const body = statement();
                functions.push({ name: nameTok ? nameTok.v : '?', line: t.line, header, body });
            } else {
                const st = untilSemicolon();
                if (st.length) globals.push({ type: 'stmt', line: t.line, toks: st });
                else pos++;
            }
        }
        return { functions, globals };
    }

    // ------------------------------------------------------------ simulator

    class Simulation {
        constructor(params) {
            this.lineSize = normaliseLineSize(params.cacheLineSize);
            this.lineSizeRequested = Number(params.cacheLineSize) || 64;
            this.arraySize = Math.max(1, Math.floor(Number(params.arraySize) || 1000));
            this.loopIterations = Math.max(0, Math.floor(Number(params.loopIterations) || 1000));
            this.threads = Math.min(64, Math.max(1, Math.floor(Number(params.threadCount) || 1)));
            this.caches = Array.from({ length: this.threads }, () => new L1Cache(this.lineSize));
            this.arrays = new Map();
            this.nextBase = 0x10000;
            this.env = {};
            this.lines = new Map();
            this.loops = new Map();
            this.accesses = 0;
            this.steps = 0;
            this.capped = false;
            this.notes = new Set();
            this.thread = 0;
        }

        // -- arrays

        declareArray(name, dims, elemSize, line) {
            const count = dims.reduce((a, b) => a * b, 1);
            const base = Math.ceil(this.nextBase / ARRAY_ALIGN) * ARRAY_ALIGN;
            this.nextBase = base + count * elemSize;
            const arr = { name, dims, elemSize, base, line };
            this.arrays.set(name, arr);
            return arr;
        }

        arrayFor(name, nSubscripts) {
            let arr = this.arrays.get(name);
            if (!arr) {
                const dims = Array.from({ length: nSubscripts }, () => this.arraySize);
                arr = this.declareArray(name, dims, 4, null);
                arr.assumed = true;
            }
            return arr;
        }

        arrayLength(name) {
            const arr = this.arrays.get(name);
            if (arr) return arr.dims[0];
            if (this.env[name] !== undefined) throw new Unknown(name);
            this.arrayFor(name, 1);
            return this.arraySize;
        }

        // -- statements

        lineStats(line) {
            let s = this.lines.get(line);
            if (!s) {
                s = { line, perThread: Array.from({ length: this.threads }, () => ({ accesses: 0, hits: 0, cold: 0, capacity: 0, coherence: 0 })), arrays: new Set(), unknownIndex: false };
                this.lines.set(line, s);
            }
            return s;
        }

        touch(arr, flatIndex, isWrite, stats) {
            if (this.accesses >= MAX_ACCESSES) { this.capped = true; throw new StopSimulation(); }
            this.accesses++;
            const addr = arr.base + flatIndex * arr.elemSize;
            const cache = this.caches[this.thread];
            const line = cache.lineOf(addr);
            const kind = cache.access(line);
            const pt = stats.perThread[this.thread];
            pt.accesses++;
            if (kind === 'hit') pt.hits++;
            else pt[kind]++;
            if (isWrite && this.threads > 1) {
                for (let t = 0; t < this.threads; t++) {
                    if (t !== this.thread) this.caches[t].invalidate(line);
                }
            }
        }

        // Turns a statement's tokens into a list of actions run each time the
        // statement executes.
        compileStatement(node) {
            if (node.compiled) return node.compiled;
            const toks = node.toks;
            const actions = [];
            const declared = this.compileDeclaration(node);
            const skip = declared ? declared.skip : -1;

            // array accesses
            const accessActions = [];
            for (let i = 0; i < toks.length; i++) {
                if (i <= skip) continue;
                const t = toks[i];
                const next = toks[i + 1];
                if (t.t !== 'id' || !next || next.t !== 'p' || next.v !== '[') continue;
                const prev = toks[i - 1];
                if (prev && prev.t === 'p' && (prev.v === '.' || prev.v === '->')) continue;
                const subs = [];
                let j = i + 1;
                while (toks[j] && toks[j].t === 'p' && toks[j].v === '[') {
                    let depth = 1, k = j + 1;
                    while (k < toks.length && depth) {
                        if (toks[k].t === 'p' && toks[k].v === '[') depth++;
                        if (toks[k].t === 'p' && toks[k].v === ']') depth--;
                        k++;
                    }
                    subs.push(toks.slice(j + 1, k - 1));
                    j = k;
                }
                const after = toks[j];
                const isWrite = !!(after && after.t === 'p' && (ASSIGN_OPS.has(after.v) || after.v === '++' || after.v === '--'))
                    || !!(prev && prev.t === 'p' && (prev.v === '++' || prev.v === '--'));
                const pureWrite = !!(after && after.t === 'p' && after.v === '=');
                accessActions.push({ kind: 'access', name: t.v, subs: subs.map(s => tryCompile(s, this)), nsubs: subs.length, isWrite, pureWrite });
            }
            // reads first, then the element being assigned
            accessActions.sort((a, b) => (a.pureWrite ? 1 : 0) - (b.pureWrite ? 1 : 0));
            actions.push(...accessActions);

            // scalar assignment such as idx = (i * 7) % n or i += 2
            const assign = declared && declared.assign ? declared.assign : this.compileAssignment(toks);
            if (assign) actions.push(assign);
            node.compiled = actions;
            return actions;
        }

        compileAssignment(toks) {
            // x op= expr, x++ / ++x / x-- / --x
            if (toks.length === 2 && toks[0].t === 'id' && toks[1].t === 'p' && (toks[1].v === '++' || toks[1].v === '--')) {
                return { kind: 'assign', name: toks[0].v, op: toks[1].v === '++' ? '+=' : '-=', fn: () => 1 };
            }
            if (toks.length === 2 && toks[1].t === 'id' && toks[0].t === 'p' && (toks[0].v === '++' || toks[0].v === '--')) {
                return { kind: 'assign', name: toks[1].v, op: toks[0].v === '++' ? '+=' : '-=', fn: () => 1 };
            }
            if (toks.length >= 3 && toks[0].t === 'id' && toks[1].t === 'p' && ASSIGN_OPS.has(toks[1].v)) {
                return { kind: 'assign', name: toks[0].v, op: toks[1].v, fn: tryCompile(toks.slice(2), this) };
            }
            return null;
        }

        // Recognises array and scalar declarations. Returns the index of the
        // last token that belongs to the declarator, so it is not read as an
        // access, and the scalar assignment if there is one.
        compileDeclaration(node) {
            const toks = node.toks;
            const words = [];
            let i = 0;
            // leading type words: const int, std::vector<std::vector<int>>, unsigned long, ...
            const isVector = toks.some((z, k) => z.t === 'id' && (z.v === 'vector' || z.v === 'array') && toks[k + 1] && toks[k + 1].t === 'p' && toks[k + 1].v === '<');
            if (isVector) {
                // find the variable name: the identifier after the closing '>' of the template
                let depth = 0, k = 0, started = false;
                for (; k < toks.length; k++) {
                    const z = toks[k];
                    if (z.t === 'p' && z.v === '<') { depth++; started = true; }
                    else if (z.t === 'p' && z.v === '>') depth--;
                    else if (z.t === 'p' && z.v === '>>') depth -= 2;
                    if (started && depth <= 0) break;
                }
                const nameTok = toks[k + 1] && toks[k + 1].t === 'p' && toks[k + 1].v === '&' ? null : toks[k + 1];
                if (!nameTok || nameTok.t !== 'id') return null;
                const tmpl = toks.slice(0, k + 1).map(z => z.v);
                const vecDepth = tmpl.filter(w => w === 'vector').length || 1;
                const isStdArray = tmpl.includes('array');
                const inner = tmpl.filter(w => !['std', '::', 'vector', 'array', '<', '>', '>>', ','].includes(w));
                const elemSize = elemSizeOf(inner.filter(w => isNaN(Number(w))));
                const rest = toks.slice(k + 2);
                let dims = null;
                if (isStdArray) {
                    // std::array<T, N>: N is the last template argument
                    const lt = toks.findIndex(z => z.t === 'p' && z.v === '<');
                    const args = toks.slice(lt + 1, k);
                    const comma = args.map((z, idx) => (z.t === 'p' && z.v === ',' ? idx : -1)).filter(x => x >= 0).pop();
                    const n = comma !== undefined ? this.evalConst(args.slice(comma + 1)) : null;
                    dims = [n || this.arraySize];
                } else if (rest[0] && rest[0].t === 'p' && rest[0].v === '(') {
                    const argsEnd = findClose(rest, 0);
                    const args = splitArgs(rest.slice(1, argsEnd));
                    const n = args[0] ? this.evalConst(args[0]) : null;
                    dims = [n || this.arraySize];
                    if (vecDepth > 1) {
                        let m = null;
                        if (args[1]) {
                            const p = args[1].findIndex(z => z.t === 'p' && z.v === '(');
                            if (p >= 0) {
                                const innerArgs = splitArgs(args[1].slice(p + 1, findClose(args[1], p)));
                                m = innerArgs[0] ? this.evalConst(innerArgs[0]) : null;
                            }
                        }
                        dims.push(m || dims[0]);
                    }
                } else if (rest[0] && rest[0].t === 'p' && rest[0].v === '{') {
                    const items = splitArgs(rest.slice(1, findClose(rest, 0)));
                    dims = [items.length || this.arraySize];
                } else {
                    dims = Array.from({ length: vecDepth }, () => this.arraySize);
                    this.notes.add(`${nameTok.v} has no size in the code, so it has Array Size (${this.arraySize}) elements`);
                }
                node.declare = { name: nameTok.v, dims, elemSize };
                return { skip: k + 1 };
            }
            // C array: [type words] name [N] ([M]) [= ...]
            while (i < toks.length && toks[i].t === 'id' && isTypeName(toks[i].v) && toks[i + 1] && !(toks[i + 1].t === 'p' && toks[i + 1].v === '[')) {
                words.push(toks[i].v);
                i++;
                if (toks[i] && toks[i].t === 'p' && toks[i].v === '::') i++;
            }
            while (toks[i] && toks[i].t === 'p' && (toks[i].v === '*' || toks[i].v === '&')) { words.push(toks[i].v); i++; }
            if (words.length === 0 || !toks[i] || toks[i].t !== 'id') {
                return null;
            }
            const name = toks[i].v;
            const after = toks[i + 1];
            if (after && after.t === 'p' && after.v === '[') {
                const dims = [];
                let j = i + 1;
                while (toks[j] && toks[j].t === 'p' && toks[j].v === '[') {
                    const close = findClose(toks, j, '[', ']');
                    const n = this.evalConst(toks.slice(j + 1, close));
                    dims.push(n || this.arraySize);
                    j = close + 1;
                }
                node.declare = { name, dims, elemSize: elemSizeOf(words) };
                return { skip: j - 1 };
            }
            if (after && after.t === 'p' && after.v === '=') {
                const rhs = toks.slice(i + 2);
                // T* p = new T[n];
                if (rhs[0] && rhs[0].t === 'id' && rhs[0].v === 'new') {
                    const lb = rhs.findIndex(z => z.t === 'p' && z.v === '[');
                    if (lb > 0) {
                        const n = this.evalConst(rhs.slice(lb + 1, findClose(rhs, lb, '[', ']')));
                        node.declare = { name, dims: [n || this.arraySize], elemSize: elemSizeOf(rhs.slice(1, lb).map(z => z.v)) };
                        return { skip: toks.length - 1 };
                    }
                }
                // scalar: int idx = expr
                const commaAt = splitArgs(rhs)[0].length;
                return { skip: i, assign: { kind: 'assign', name, op: '=', fn: tryCompile(rhs.slice(0, commaAt), this) } };
            }
            return { skip: i };
        }

        evalConst(toks) {
            const fn = tryCompile(toks, this);
            if (!fn) return null;
            try {
                const v = fn(this.env, this);
                return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
            } catch (e) {
                return null;
            }
        }

        runActions(actions, line) {
            const stats = this.lines.get(line) || null;
            for (const a of actions) {
                if (a.kind === 'access') {
                    const arr = this.arrayFor(a.name, a.nsubs);
                    let flat = 0;
                    for (let d = 0; d < a.nsubs; d++) {
                        let v = 0;
                        const fn = a.subs[d];
                        if (fn) {
                            try { v = Math.floor(fn(this.env, this)); } catch (e) { v = 0; this.lineStats(line).unknownIndex = true; }
                        } else {
                            this.lineStats(line).unknownIndex = true;
                        }
                        const dimSize = arr.dims[d] !== undefined ? arr.dims[d] : this.arraySize;
                        flat = flat * dimSize + v;
                    }
                    const s = this.lineStats(line);
                    s.arrays.add(a.name);
                    this.touch(arr, flat, a.isWrite, s);
                } else if (a.kind === 'assign') {
                    let v;
                    if (!a.fn) { delete this.env[a.name]; continue; }
                    try {
                        v = a.fn(this.env, this);
                    } catch (e) {
                        delete this.env[a.name];
                        continue;
                    }
                    const cur = this.env[a.name];
                    if (a.op === '=') this.env[a.name] = v;
                    else if (typeof cur !== 'number') delete this.env[a.name];
                    else {
                        switch (a.op) {
                            case '+=': this.env[a.name] = cur + v; break;
                            case '-=': this.env[a.name] = cur - v; break;
                            case '*=': this.env[a.name] = cur * v; break;
                            case '/=': this.env[a.name] = v ? Math.trunc(cur / v) : cur; break;
                            case '%=': this.env[a.name] = v ? cur % v : cur; break;
                            case '<<=': this.env[a.name] = cur * Math.pow(2, v); break;
                            case '>>=': this.env[a.name] = Math.floor(cur / Math.pow(2, v)); break;
                            default: delete this.env[a.name];
                        }
                    }
                }
            }
        }

        step() {
            if (++this.steps > MAX_STEPS) { this.capped = true; throw new StopSimulation(); }
        }

        exec(node) {
            if (!node) return;
            switch (node.type) {
                case 'block':
                    for (const s of node.body) this.exec(s);
                    return;
                case 'stmt': {
                    const actions = this.compileStatement(node);
                    if (node.declare && !this.arrays.has(node.declare.name)) {
                        const d = node.declare;
                        this.declareArray(d.name, d.dims, d.elemSize, node.line);
                    }
                    this.step();
                    this.runActions(actions, node.line);
                    return;
                }
                case 'if': {
                    if (!node.condActions) {
                        node.condActions = this.compileStatement({ toks: node.cond, line: node.line }).filter(a => a.kind === 'access');
                    }
                    this.runActions(node.condActions, node.line);
                    this.exec(node.then);
                    return;
                }
                case 'for':
                case 'while':
                case 'rangefor':
                    this.runLoop(node, null);
                    return;
            }
        }

        // Works out the values the loop variable takes, without running the
        // body. Used to split an outer loop between threads.
        loopPlan(node) {
            if (node.type === 'for') {
                const init = this.compileStatement({ toks: node.init, line: node.line });
                const assign = init.find(a => a.kind === 'assign');
                const varName = assign ? assign.name : null;
                this.runActions(init.filter(a => a.kind === 'assign'), node.line);
                const cond = node.cond.length ? tryCompile(node.cond, this) : () => 1;
                const incr = splitIncr(node.incr).map(t => this.compileAssignment(t)).filter(Boolean);
                let known = !!cond && varName !== null;
                if (known) {
                    try { cond(this.env, this); } catch (e) { known = false; }
                }
                if (!known) {
                    if (cond) this.notes.add(`line ${node.line}: the loop condition uses a value the analyzer cannot work out, so the loop runs Loop Iterations (${this.loopIterations}) times`);
                    return { varName, count: this.loopIterations, cond: null, incr };
                }
                return { varName, cond, incr, count: null };
            }
            if (node.type === 'rangefor') {
                let count = this.loopIterations;
                if (node.container && this.arrays.has(node.container)) count = this.arrays.get(node.container).dims[0];
                return { varName: null, count, cond: null, incr: [] };
            }
            return { varName: null, count: this.loopIterations, cond: null, incr: [] };
        }

        loopValues(plan) {
            // the sequence of loop-variable values, for splitting between threads
            const values = [];
            if (plan.count !== null) {
                for (let k = 0; k < plan.count; k++) {
                    values.push(plan.varName && typeof this.env[plan.varName] === 'number' ? this.env[plan.varName] : k);
                    this.runActions(plan.incr, -1);
                    if (values.length > MAX_STEPS) break;
                }
                return values;
            }
            while (true) {
                let ok;
                try { ok = plan.cond(this.env, this); } catch (e) { break; }
                if (!ok) break;
                values.push(this.env[plan.varName]);
                if (values.length > MAX_STEPS) { this.capped = true; break; }
                const before = this.env[plan.varName];
                this.runActions(plan.incr, -1);
                if (this.env[plan.varName] === before) {
                    this.notes.add('a loop variable never changes, so that loop was run Loop Iterations times');
                    while (values.length < this.loopIterations) values.push(before);
                    break;
                }
            }
            return values;
        }

        recordIterations(line) {
            let l = this.loops.get(line);
            if (!l) { l = new Array(this.threads).fill(0); this.loops.set(line, l); }
            l[this.thread]++;
        }

        runLoop(node, threadSplit) {
            const plan = this.loopPlan(node);
            if (threadSplit) {
                const values = this.loopValues(plan);
                const T = this.threads;
                const chunks = [];
                if (threadSplit === 'spmd') {
                    for (let t = 0; t < T; t++) chunks.push(values);
                } else {
                    const size = Math.ceil(values.length / T);
                    for (let t = 0; t < T; t++) chunks.push(values.slice(t * size, (t + 1) * size));
                }
                const longest = Math.max(...chunks.map(c => c.length));
                for (let k = 0; k < longest; k++) {
                    for (let t = 0; t < T; t++) {
                        if (k >= chunks[t].length) continue;
                        this.thread = t;
                        this.bindThreadId(t);
                        if (plan.varName) this.env[plan.varName] = chunks[t][k];
                        this.recordIterations(node.line);
                        this.step();
                        this.exec(node.body);
                    }
                }
                this.thread = 0;
                return;
            }
            if (plan.count !== null) {
                for (let k = 0; k < plan.count; k++) {
                    this.recordIterations(node.line);
                    this.step();
                    this.exec(node.body);
                    this.runActions(plan.incr, node.line);
                }
                return;
            }
            while (true) {
                let ok;
                try { ok = plan.cond(this.env, this); } catch (e) { break; }
                if (!ok) break;
                const before = this.env[plan.varName];
                this.recordIterations(node.line);
                this.step();
                this.exec(node.body);
                this.runActions(plan.incr, node.line);
                if (this.env[plan.varName] === before) {
                    this.notes.add(`line ${node.line}: the loop variable never changes, so the loop stopped after one pass`);
                    break;
                }
            }
        }

        bindThreadId(t) {
            for (const n of THREAD_ID_NAMES) this.env[n] = t;
        }

        runFunction(fn) {
            const usesThreadId = tokensOf(fn.body).some(z => z.t === 'id' && THREAD_ID_NAMES.includes(z.v))
                || fn.header.some(z => z.t === 'id' && THREAD_ID_NAMES.includes(z.v));
            const body = fn.body && fn.body.type === 'block' ? fn.body.body : [fn.body];
            for (const s of body) {
                if (!s) continue;
                const isLoop = s.type === 'for' || s.type === 'while' || s.type === 'rangefor';
                if (this.threads > 1 && isLoop) {
                    this.runLoop(s, usesThreadId ? 'spmd' : 'split');
                } else if (this.threads > 1 && usesThreadId) {
                    for (let t = 0; t < this.threads; t++) {
                        this.thread = t;
                        this.bindThreadId(t);
                        this.exec(s);
                    }
                    this.thread = 0;
                } else {
                    this.thread = 0;
                    this.bindThreadId(0);
                    this.exec(s);
                }
            }
        }

        run(program) {
            try {
                for (const g of program.globals) this.exec(g);
                for (const fn of program.functions) this.runFunction(fn);
            } catch (e) {
                if (!(e instanceof StopSimulation)) throw e;
            }
        }
    }

    class StopSimulation extends Error {}

    function tokensOf(node) {
        const out = [];
        (function walk(n) {
            if (!n) return;
            if (Array.isArray(n)) { n.forEach(walk); return; }
            if (n.t) { out.push(n); return; }
            for (const k of ['toks', 'init', 'cond', 'incr']) if (n[k]) walk(n[k]);
            if (n.body) walk(n.body);
            if (n.then) walk(n.then);
        })(node);
        return out;
    }

    function findClose(toks, openIdx, open = null, close = null) {
        const o = open || toks[openIdx].v;
        const c = close || { '(': ')', '[': ']', '{': '}' }[o];
        let depth = 0;
        for (let k = openIdx; k < toks.length; k++) {
            if (toks[k].t === 'p' && toks[k].v === o) depth++;
            if (toks[k].t === 'p' && toks[k].v === c) { depth--; if (depth === 0) return k; }
        }
        return toks.length;
    }

    function splitArgs(toks) {
        const parts = [[]];
        let depth = 0;
        for (const t of toks) {
            if (t.t === 'p' && ['(', '[', '{', '<'].includes(t.v)) depth++;
            if (t.t === 'p' && [')', ']', '}', '>'].includes(t.v)) depth--;
            if (t.t === 'p' && t.v === '>>') depth -= 2;
            if (t.t === 'p' && t.v === ',' && depth === 0) parts.push([]);
            else parts[parts.length - 1].push(t);
        }
        return parts.filter(p => p.length);
    }

    function splitIncr(toks) {
        return splitArgs(toks);
    }

    function normaliseLineSize(v) {
        let n = Math.floor(Number(v) || 64);
        n = Math.min(4096, Math.max(4, n));
        // round to the nearest power of two: real caches use power-of-two lines
        return Math.pow(2, Math.round(Math.log2(n)));
    }

    // ---------------------------------------------------------------- API

    function simulate(code, params) {
        const { toks, defines } = tokenize(code);
        // replace #define constants
        const expanded = [];
        for (const t of toks) {
            if (t.t === 'id' && defines[t.v]) expanded.push(...defines[t.v].map(d => ({ ...d, line: t.line })));
            else expanded.push(t);
        }
        const program = parseProgram(expanded);
        const sim = new Simulation(params || {});
        const started = Date.now();
        sim.run(program);

        const lines = {};
        let hits = 0, misses = 0, accesses = 0, cold = 0, capacity = 0, coherence = 0;
        for (const [line, s] of sim.lines) {
            if (line < 0) continue;
            const total = { accesses: 0, hits: 0, misses: 0, cold: 0, capacity: 0, coherence: 0 };
            let slowest = 0;
            for (const pt of s.perThread) {
                const m = pt.cold + pt.capacity + pt.coherence;
                total.accesses += pt.accesses;
                total.hits += pt.hits;
                total.misses += m;
                total.cold += pt.cold;
                total.capacity += pt.capacity;
                total.coherence += pt.coherence;
                slowest = Math.max(slowest, pt.hits * HIT_NS + m * MISS_NS);
            }
            if (total.accesses === 0) continue;
            lines[line] = { ...total, latency: slowest, arrays: [...s.arrays], unknownIndex: s.unknownIndex };
            hits += total.hits; misses += total.misses; accesses += total.accesses;
            cold += total.cold; capacity += total.capacity; coherence += total.coherence;
        }
        const loops = {};
        for (const [line, perThread] of sim.loops) {
            if (line < 0) continue;
            loops[line] = { iterations: perThread.reduce((a, b) => a + b, 0), slowestThread: Math.max(...perThread) };
        }
        const cache = sim.caches[0];
        return {
            lines,
            loops,
            arrays: [...sim.arrays.values()].map(a => ({ name: a.name, dims: a.dims, elemSize: a.elemSize, base: a.base, assumed: !!a.assumed })),
            summary: {
                accesses, hits, misses, cold, capacity, coherence,
                missRate: accesses ? misses / accesses : 0,
                lineSize: sim.lineSize,
                lineSizeRequested: sim.lineSizeRequested,
                sizeBytes: cache.sizeBytes,
                ways: cache.ways,
                sets: cache.numSets,
                threads: sim.threads,
                hitNs: HIT_NS,
                missNs: MISS_NS,
                capped: sim.capped,
                maxAccesses: MAX_ACCESSES,
                notes: [...sim.notes],
                ms: Date.now() - started
            }
        };
    }

    const api = { simulate, L1Cache, tokenize, HIT_NS, MISS_NS, L1_SIZE_BYTES, L1_WAYS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CacheModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
