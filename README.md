# l1-cache-simulator

Write C++ in the browser and see where the time goes, line by line. Per-line cost, L1 cache cost and an execution timeline.

**Try it in your browser:** [Open the live demo](https://godofecht.github.io/l1-cache-simulator/)

![The C++ Performance Analyzer after a run. On the left, a code editor holds a short C++ program that fills a vector of 1000 integers in a loop, with parameter boxes below it for Array Size, Loop Iterations, Thread Count and Cache Line Size. On the right, the Output panel lists each line with its operation type, a cost in nanoseconds and a cost in L1 units. Below, the Performance Analysis section has export buttons and the start of the execution timeline.](docs/analysis.jpg)

## What this is

The page is called the C++ Performance Analyzer. You type or load a C++ program, press **Run**, and each line comes back with an estimated cost in nanoseconds (billionths of a second) and the reason for it, such as a memory write or a function call. A timeline below shows the same costs laid end to end, so you can see which lines take most of the time.

The estimates are expressed in "L1" units too. The L1 cache is the smallest and fastest memory inside a processor core. Reading from it takes about one nanosecond, while reading from main memory takes about a hundred. Counting cost in L1 units shows how many fast cache reads a slower operation is worth.

The analyzer does not compile your C++. It reads the code in JavaScript and does two things. It matches each line against patterns (a loop, a function call, a lock) and gives it a cost from a table. It also runs the loops itself, works out the memory address of every array access, and sends each address through a model of an L1 cache. Array accesses then cost 1 ns when the cache has the data (a hit) and 100 ns when it does not (a miss). Change the cache line size, the array size or the number of threads and the hit and miss counts change with them.

## What you can learn from it

- Why memory access is slow compared with arithmetic, and why processors have caches (Computer Science: the memory hierarchy).
- How a loop multiplies the cost of its body by the number of times it runs.
- Why reading an array in order is fast: one miss brings in a whole cache line, and the next few accesses hit.
- Why a bigger cache line helps a strided loop, and why an array larger than the cache misses again on a second pass.
- How threads that write to the same cache line slow each other down (false sharing).
- How a simple cost model turns source code into a time estimate, and where such a model is too simple.
- How a web page can parse text with regular expressions (patterns that match pieces of text).
- How the D3 library draws a zoomable timeline in the browser.

## Run it

### In your browser

1. [Open the live demo](https://godofecht.github.io/l1-cache-simulator/).
2. Edit the code in the editor, or pick an example from **Load Template...**: Basic Operations, Vector Processing, Matrix Multiplication, Cache Analysis or Multithreading.
3. Set the numbers under **Parameters** if you want to:
   - **Array Size**: the number of elements in any array whose size the code does not give, such as a `std::vector<int>& v` function parameter.
   - **Loop Iterations**: how many times a `while` loop runs, and any `for` loop whose limit the analyzer cannot work out.
   - **Thread Count**: how many threads share each function's outer loop. Each thread has its own L1 cache.
   - **Cache Line Size**: the size of one cache line in bytes. It is rounded to a power of two.
4. Press **Run**. The **Output** panel starts with an **L1 cache model** card: the cache's size and shape, and the total hits and misses. Below it is one card per line. A line that reads or writes an array shows how many accesses it made and how many hit or missed. The **Performance Analysis** section appears below.

A quick experiment: load **Cache Analysis**, press **Run**, then change **Cache Line Size** from 64 to 128 and press **Run** again. The first loop steps 64 bytes at a time, so at 64 every access misses and at 128 half of them hit.

Controls:

| Control | What it does |
|---|---|
| **Load Template...** | Replaces the code with an example program |
| **Run** | Analyses the code in the editor |
| **Compare** | Keeps the last result. Edit the code, then press **Compare Results** to see both side by side. **Exit Compare** leaves this mode |
| **Export JSON** | Downloads the result as a JSON file |
| **Share Link** | Copies a link with the code and parameters packed into it |
| **Print Report** | Asks to confirm, then builds a printable report |
| **Zoom In**, **Zoom Out**, **Reset** | Zoom the timeline |
| **Export SVG** | Downloads the timeline as an SVG picture |
| **Screenshot** | Saves the timeline as a PNG picture |

There are no keyboard shortcuts beyond the normal editing keys of the code editor.

### On your own computer

The page is plain HTML and JavaScript with no build step. All the libraries it needs are in the `vendor/` folder.

**You will need:**

- [Git](https://git-scm.com/downloads) to download the code.
- [Python 3](https://www.python.org/downloads/), used here only as a small local web server. Any static file server works.
- A current web browser.

1. Download the code:

   ```bash
   git clone https://github.com/godofecht/l1-cache-simulator.git
   cd l1-cache-simulator
   ```

2. Start a local web server in that folder:

   ```bash
   python3 -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser. You should see the editor with a short example program. Press **Run** to analyse it.

To run the checks for the cache model you need [Node.js](https://nodejs.org/). From the project folder:

```bash
node tests/cache_model.test.js
```

Each check prints `ok` and the last line reads `9 passed`.

Opening **index.html** straight from disk may stop the code editor from loading, because browsers limit what a page opened from a file can load, so use the server.

## How it works

When you press **Run**, `analyzeCode()` in **working_analyzer.js** reads the code and the parameters. `WorkingAnalyzer.parseCode()` goes through the code line by line, skips blank lines and comments, and checks each line against a list of patterns in order. The first pattern that matches decides the operation type. Its cost comes from a table at the top of the class:

| Operation | Cost in ns |
|---|---|
| L1 cache hit (a plain assignment) | 1 |
| Cache miss | 4 |
| Arithmetic | 0.5 |
| Branch (one loop test) | 3 |
| Function call | 17 |
| Mutex lock | 17 |
| Array access that hits in L1 | 1 |
| Array access that misses in L1 | 100 |

A `for` loop costs one branch plus 0.5 ns of work for every iteration. The cache model counts the iterations by running the loop. A method call such as `v.push_back()` costs two function calls. A line with `template` or angle brackets, which includes `#include <vector>`, costs five function calls. The "L1" figure is the cost divided by the 1 ns of an L1 hit.

Array accesses are costed by **cache_model.js**. `CacheModel.simulate()` turns the code into tokens, finds the functions, loops and statements, and runs them:

- It knows arrays declared as C arrays (`int a[N]`), `std::array`, `std::vector` (including a vector of vectors) and `new T[n]`. An array the code does not size has **Array Size** elements. Arrays sit one after another in memory, each starting on a 64-byte boundary. A 2D array is stored row by row.
- A `for` loop runs with its real start, condition and step, so `i += 16` or `i < v.size()` work. Integer variables such as `int idx = (i * 7) % n;` are worked out as the loop runs. `while` loops run **Loop Iterations** times. The body of an `if` always runs and `else` is skipped. Each function body runs once, top to bottom, and calls are not followed.
- Each access goes to a 32 KiB, 8-way set associative cache with least recently used (LRU) replacement. The address picks a line (address divided by the line size), and the line picks a set (line number modulo the number of sets). With 64-byte lines there are 32768 / (64 x 8) = 64 sets.
- A miss is counted as "first touch" when that cache has never held the line, "evicted earlier" when it held it once and had to make room, or "lost to another thread's write".
- With more than one thread, each function's outer loop is split into equal chunks, as OpenMP's `parallel for` does, and the threads take turns one iteration at a time. If the code uses a variable named `thread_id`, `tid`, `threadId` or `thread_idx`, every thread runs the whole function with its own number in that variable. A write by one thread removes the line from the other threads' caches. A line's time is the time of its slowest thread.

`generateTimelineData()` then places each operation after the one before it on a track for its category: cpu, memory, cache, function, sync or branch. `createD3Timeline()` draws those tracks with D3.

| File or folder | What is in it |
|---|---|
| `index.html` | The page layout: editor, parameter boxes, output panel, timeline and statistics |
| `working_analyzer.js` | The cost table, the line parser, the timeline drawing, the templates, and the export, share, compare and print functions |
| `cache_model.js` | The L1 cache model: the code reader, the loop runner and the cache |
| `tests/cache_model.test.js` | Checks for the cache model, run with Node.js |
| `simulator.cpp` | A small C++ program that prints which compiler built it |
| `simulator.s` | The ARM64 assembly a compiler produced from `simulator.cpp` on macOS |
| `vendor/` | Local copies of Monaco Editor, D3, d3-flame-graph, SweetAlert2 and Tailwind CSS |
| `docs/analysis.jpg` | The screenshot at the top of this page |
| `404.html` | The "page not found" page for GitHub Pages |

## Ideas to try

1. Change a number in the `this.operations` table at the top of **working_analyzer.js**, for example the memory read cost, and see how the totals change.
2. In `parseCode()` in **working_analyzer.js**, make `#include` lines cost nothing. At the moment they match the template pattern because of the angle brackets.
3. Write a loop that reads a 512 by 512 matrix by rows, then one that reads it by columns. Compare the miss counts and explain the difference.
4. Write two passes over a `std::vector<int>& v` parameter and raise **Array Size** from 4000 to 10000. The second pass stops hitting once the array no longer fits in 32 KiB.
5. Set **Thread Count** to 4 and have each thread add to `counts[thread_id]`. Then change it to `counts[thread_id * 16]` and compare the misses.
6. Change `L1_SIZE_BYTES` or `L1_WAYS` at the top of **cache_model.js**, or add a second, larger cache behind the first that a miss tries before going to memory.
7. Add a template of your own to the `cppTemplates` object in **working_analyzer.js** and a matching `<option>` to the **Load Template...** list in **index.html**.
8. Make **Share Link** work both ways: when the page loads, read the `data` value from the address, decode it and put the code and parameters back.

## Technical details

Each line of output is annotated with the time it cost, its L1 cache cost and the reason, such as template compilation overhead, function call overhead or a memory write. The timeline can be zoomed. The four parameters (array size, loop iterations, thread count and cache line size) are read on every run and saved in the JSON export, the share link and the printed report.

Results export as JSON, as an SVG of the timeline or as a printable report. **Share Link** encodes the code and parameters as Base64 JSON in a `?data=` query string and copies the address to the clipboard.

The page loads every library from `vendor/` first and falls back to a public content delivery network (CDN) if a local file fails. `vendor/amd-guard.js` and `vendor/amd-restore.js` switch the Monaco loader off while D3 and SweetAlert2 load, so those libraries register as ordinary globals.

## Project status

This is a teaching model. It is not a measurement of real hardware. Array accesses go through a modelled L1 cache; everything else still has a fixed cost. Known gaps:

- The cache model follows loops, `if` bodies and simple integer variables. It does not follow function calls, pointer arithmetic, `else` branches or values stored in arrays. An index it cannot work out is taken as 0, and the card for that line says so.
- There is one level of cache. A miss always costs 100 ns, with no L2 or L3 and no prefetching.
- Threads take turns one iteration at a time. Real threads run at uneven speeds.
- A run stops counting after 5 million array accesses and says so in the **L1 cache model** card.
- A share link encodes the session, but the page does not read it back on load yet, so opening the link shows the default program.
- Before the first run, the output panel shows a fixed "C++ Program Output" and "Assembly Output (simulator.s)" block. Neither comes from your code.
- `vendor/d3-flamegraph.min.js` is included but not loaded by the page.

## Licence

You can use, copy and change the code written for this project for any purpose, as long as you keep the copyright notice. See [LICENSE](LICENSE) (MIT). The libraries in `vendor/` keep their own licences, listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Credits

Written by Abhishek Shivakumar. To cite it, use [CITATION.cff](CITATION.cff).

Built on these libraries:

- [Monaco Editor](https://github.com/microsoft/monaco-editor) 0.44.0 by Microsoft (MIT)
- [D3](https://github.com/d3/d3) 7.9.0 by Mike Bostock (ISC)
- [d3-flame-graph](https://github.com/spiermar/d3-flame-graph) by Martin Spier (Apache-2.0)
- [SweetAlert2](https://github.com/sweetalert2/sweetalert2) 11.26.18 (MIT)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) by Tailwind Labs (MIT)
