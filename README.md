# l1-cache-simulator

Write C++ in the browser and see where the time goes, line by line. Per-line cost, L1 cache cost and an execution timeline.

**Try it in your browser:** [Open the live demo](https://godofecht.github.io/l1-cache-simulator/)

![The C++ Performance Analyzer after a run. On the left, a code editor holds a short C++ program that fills a vector of 1000 integers in a loop, with parameter boxes below it for Array Size, Loop Iterations, Thread Count and Cache Line Size. On the right, the Output panel lists each line with its operation type, a cost in nanoseconds and a cost in L1 units. Below, the Performance Analysis section has export buttons and the start of the execution timeline.](docs/analysis.jpg)

## What this is

The page is called the C++ Performance Analyzer. You type or load a C++ program, press **Run**, and each line comes back with an estimated cost in nanoseconds (billionths of a second) and the reason for it, such as a memory write or a function call. A timeline below shows the same costs laid end to end, so you can see which lines take most of the time.

The estimates are expressed in "L1" units too. The L1 cache is the smallest and fastest memory inside a processor core. Reading from it takes about one nanosecond, while reading from main memory takes about a hundred. Counting cost in L1 units shows how many fast cache reads a slower operation is worth.

The analyzer does not compile or run your C++. It reads the code one line at a time in JavaScript, matches each line against patterns (an array write, a loop, a function call) and adds up fixed costs from a table. That makes it a model you can read and change in one file.

## What you can learn from it

- Why memory access is slow compared with arithmetic, and why processors have caches (Computer Science: the memory hierarchy).
- How a loop multiplies the cost of its body by the number of times it runs.
- How a simple cost model turns source code into a time estimate, and where such a model is too simple.
- How a web page can parse text with regular expressions (patterns that match pieces of text).
- How the D3 library draws a zoomable timeline in the browser.

## Run it

### In your browser

1. [Open the live demo](https://godofecht.github.io/l1-cache-simulator/).
2. Edit the code in the editor, or pick an example from **Load Template...**: Basic Operations, Vector Processing, Matrix Multiplication, Cache Analysis or Multithreading.
3. Set the numbers under **Parameters** if you want to. **Loop Iterations** is used for any loop whose limit is a variable name instead of a number.
4. Press **Run**. The **Output** panel fills with one card per line that matched a pattern, and the **Performance Analysis** section appears below.

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
| Memory read or write (an array element) | 100 |

A `for` loop costs one branch plus 0.5 ns of work for every iteration. The iteration count comes from the number after `<` in the loop, or from **Loop Iterations** if the limit is a variable. A method call such as `v.push_back()` costs two function calls. A line with `template` or angle brackets, which includes `#include <vector>`, costs five function calls. The "L1" figure is the cost divided by the 1 ns of an L1 hit.

`generateTimelineData()` then places each operation after the one before it on a track for its category: cpu, memory, cache, function, sync or branch. `createD3Timeline()` draws those tracks with D3.

| File or folder | What is in it |
|---|---|
| `index.html` | The page layout: editor, parameter boxes, output panel, timeline and statistics |
| `working_analyzer.js` | The cost table, the line parser, the timeline drawing, the templates, and the export, share, compare and print functions |
| `simulator.cpp` | A small C++ program that prints which compiler built it |
| `simulator.s` | The ARM64 assembly a compiler produced from `simulator.cpp` on macOS |
| `vendor/` | Local copies of Monaco Editor, D3, d3-flame-graph, SweetAlert2 and Tailwind CSS |
| `docs/analysis.jpg` | The screenshot at the top of this page |
| `404.html` | The "page not found" page for GitHub Pages |

## Ideas to try

1. Change a number in the `this.operations` table at the top of **working_analyzer.js**, for example the memory read cost, and see how the totals change.
2. In `parseCode()` in **working_analyzer.js**, make `#include` lines cost nothing. At the moment they match the template pattern because of the angle brackets.
3. Make **Array Size** matter. In `parseCode()`, give an array access a cache hit cost when the array fits in a 32 KB L1 cache and a memory cost when it does not.
4. Make **Cache Line Size** matter. For a loop that steps through an array one element at a time, only one access per cache line misses. Use the line size to work out how many accesses hit.
5. Add a template of your own to the `cppTemplates` object in **working_analyzer.js** and a matching `<option>` to the **Load Template...** list in **index.html**.
6. Make **Share Link** work both ways: when the page loads, read the `data` value from the address, decode it and put the code and parameters back.

## Technical details

Each line of output is annotated with the time it cost, its L1 cache cost and the reason, such as template compilation overhead, function call overhead or a memory write. The timeline can be zoomed. The four parameters (array size, loop iterations, thread count and cache line size) are read on every run and saved in the JSON export, the share link and the printed report.

Results export as JSON, as an SVG of the timeline or as a printable report. **Share Link** encodes the code and parameters as Base64 JSON in a `?data=` query string and copies the address to the clipboard.

The page loads every library from `vendor/` first and falls back to a public content delivery network (CDN) if a local file fails. `vendor/amd-guard.js` and `vendor/amd-restore.js` switch the Monaco loader off while D3 and SweetAlert2 load, so those libraries register as ordinary globals.

## Project status

This is a teaching model with fixed costs. It is not a measurement of real hardware. Known gaps:

- Only **Loop Iterations** changes the result. **Array Size**, **Thread Count** and **Cache Line Size** are recorded but not used in the cost model yet.
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
