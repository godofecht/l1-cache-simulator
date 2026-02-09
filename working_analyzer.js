// C++ Performance Analyzer
class WorkingAnalyzer {
    constructor() {
        this.operations = {
            'memory_read': { latency: 100, unit: 'ns', color: '#f093fb', category: 'memory' },
            'memory_write': { latency: 100, unit: 'ns', color: '#f5576c', category: 'memory' },
            'cache_hit': { latency: 1, unit: 'ns', color: '#4facfe', category: 'cache' },
            'cache_miss': { latency: 4, unit: 'ns', color: '#00f2fe', category: 'cache' },
            'computation': { latency: 0.5, unit: 'ns', color: '#667eea', category: 'cpu' },
            'function_call': { latency: 17, unit: 'ns', color: '#43e97b', category: 'function' },
            'branch': { latency: 3, unit: 'ns', color: '#30cfd0', category: 'branch' },
            'mutex_lock': { latency: 17, unit: 'ns', color: '#fa709a', category: 'sync' }
        };
        
        this.timelineData = [];
        this.analysisParams = {};
    }

    analyzeCode(code, params) {
        console.log('Analysis started');
        this.analysisParams = params;
        
        try {
            const operations = this.parseCode(code);
            console.log('Operations parsed:', operations.length);
            
            this.timelineData = this.generateTimelineData(operations);
            
            const result = this.generateAnalysisReport(operations);
            console.log('Analysis completed');
            return result;
        } catch (error) {
            console.error('Analysis error:', error);
            throw error;
        }
    }

    parseCode(code) {
        const operations = [];
        const lines = code.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;
            
            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('/*')) continue;
            
            // Array access: data[i] = value
            if (line.match(/\w+\s*\[\s*\w+\s*\]\s*=/)) {
                operations.push({
                    type: 'memory_write',
                    line: lineNumber,
                    original: line,
                    description: 'Array write operation',
                    depth: 0,
                    category: 'memory',
                    impact: { estimatedLatency: 100, l1Equivalents: 100, cacheHitRate: 0.8 }
                });
            }
            
            // Array access: value = data[i]
            if (line.match(/=\s*\w+\s*\[\s*\w+\s*\]/)) {
                operations.push({
                    type: 'memory_read',
                    line: lineNumber,
                    original: line,
                    description: 'Array read operation',
                    depth: 0,
                    category: 'memory',
                    impact: { estimatedLatency: 100, l1Equivalents: 100, cacheHitRate: 0.8 }
                });
            }
            
            // Function calls (excluding for, while, if)
            if (line.match(/\w+\s*\([^)]*\)/) && !line.match(/for|while|if/)) {
                operations.push({
                    type: 'function_call',
                    line: lineNumber,
                    original: line,
                    description: 'Function call',
                    depth: 0,
                    category: 'function',
                    impact: { callOverhead: 17, l1Equivalents: 17 }
                });
            }
            
            // For loops
            if (line.match(/for\s*\([^)]*\)/)) {
                operations.push({
                    type: 'loop',
                    line: lineNumber,
                    original: line,
                    description: 'For loop',
                    depth: 0,
                    category: 'branch',
                    impact: { iterations: 1000, branchLatency: 3000, l1Equivalents: 3000 }
                });
            }
            
            // While loops
            if (line.match(/while\s*\([^)]*\)/)) {
                operations.push({
                    type: 'loop',
                    line: lineNumber,
                    original: line,
                    description: 'While loop',
                    depth: 0,
                    category: 'branch',
                    impact: { iterations: 1000, branchLatency: 3000, l1Equivalents: 3000 }
                });
            }
            
            // If statements
            if (line.match(/if\s*\([^)]*\)/)) {
                operations.push({
                    type: 'branch',
                    line: lineNumber,
                    original: line,
                    description: 'Conditional branch',
                    depth: 0,
                    category: 'branch',
                    impact: { branchLatency: 3, l1Equivalents: 3 }
                });
            }
            
            // Arithmetic operations
            if (line.match(/[a-zA-Z_]\w*\s*[\+\-\*\/\%]\s*[a-zA-Z_]\w*/)) {
                operations.push({
                    type: 'computation',
                    line: lineNumber,
                    original: line,
                    description: 'Arithmetic computation',
                    depth: 0,
                    category: 'cpu',
                    impact: { operations: 1, computationLatency: 0.5, l1Equivalents: 0.5 }
                });
            }
            
            // Synchronization functions
            if (line.match(/mutex|lock|atomic|thread/)) {
                operations.push({
                    type: 'synchronization',
                    line: lineNumber,
                    original: line,
                    description: 'Thread synchronization',
                    depth: 0,
                    category: 'sync',
                    impact: { syncLatency: 17, l1Equivalents: 17, contentionFactor: 1 }
                });
            }
        }
        
        return operations;
    }

    generateTimelineData(operations) {
        const timeline = {
            cpu: [],
            memory: [],
            cache: [],
            function: [],
            sync: [],
            branch: []
        };
        
        let currentTime = 0;
        
        operations.forEach(op => {
            let latency = 0;
            let category = op.category;
            
            switch (op.type) {
                case 'memory_access':
                case 'memory_read':
                case 'memory_write':
                    latency = op.impact.estimatedLatency;
                    break;
                case 'loop':
                    latency = op.impact.branchLatency;
                    break;
                case 'function_call':
                    latency = op.impact.callOverhead;
                    break;
                case 'computation':
                    latency = op.impact.computationLatency;
                    break;
                case 'branch':
                    latency = op.impact.branchLatency;
                    break;
                case 'synchronization':
                    latency = op.impact.syncLatency;
                    break;
            }
            
            const event = {
                name: op.description,
                start: currentTime,
                duration: latency,
                category: category,
                line: op.line,
                original: op.original,
                color: this.operations[op.type]?.color || '#666'
            };
            
            timeline[category].push(event);
            currentTime += latency;
        });
        
        return timeline;
    }

    generateAnalysisReport(operations) {
        let totalLatency = 0;
        let totalL1Equivalents = 0;
        let memoryAccesses = 0;
        let maxDepth = 0;
        
        const detailedOps = operations.map(op => {
            let latency = 0;
            let l1Equivalents = 0;
            
            switch (op.type) {
                case 'memory_access':
                case 'memory_read':
                case 'memory_write':
                    latency = op.impact.estimatedLatency;
                    l1Equivalents = op.impact.l1Equivalents;
                    memoryAccesses++;
                    break;
                case 'loop':
                    latency = op.impact.branchLatency;
                    l1Equivalents = op.impact.l1Equivalents;
                    break;
                case 'function_call':
                    latency = op.impact.callOverhead;
                    l1Equivalents = op.impact.l1Equivalents;
                    break;
                case 'computation':
                    latency = op.impact.computationLatency;
                    l1Equivalents = op.impact.l1Equivalents;
                    break;
                case 'branch':
                    latency = op.impact.branchLatency;
                    l1Equivalents = op.impact.l1Equivalents;
                    break;
                case 'synchronization':
                    latency = op.impact.syncLatency;
                    l1Equivalents = op.impact.l1Equivalents;
                    break;
            }
            
            totalLatency += latency;
            totalL1Equivalents += l1Equivalents;
            maxDepth = Math.max(maxDepth, op.depth);
            
            return {
                ...op,
                latency,
                l1Equivalents,
                formattedLatency: this.formatLatency(latency)
            };
        });
        
        return {
            operations: detailedOps,
            summary: {
                totalOperations: operations.length,
                totalLatency,
                totalL1Equivalents: Math.round(totalL1Equivalents),
                cacheHitRate: 80, // Default for simple analyzer
                memoryAccesses,
                formattedLatency: this.formatLatency(totalLatency),
                maxDepth
            }
        };
    }

    formatLatency(ns) {
        if (ns >= 1000000000) {
            return `${(ns / 1000000000).toFixed(2)}s`;
        } else if (ns >= 1000000) {
            return `${(ns / 1000000).toFixed(2)}ms`;
        } else if (ns >= 1000) {
            return `${(ns / 1000).toFixed(2)}μs`;
        } else {
            return `${ns.toFixed(2)}ns`;
        }
    }

    createTimelineVisualization() {
        const container = document.getElementById('timelineTracks');
        container.innerHTML = '';
        
        const allEvents = Object.values(this.timelineData).flat();
        console.log('Timeline events:', allEvents.length);
        
        if (allEvents.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">No timeline events detected</div>';
            return;
        }
        
        // Create fancy D3.js timeline
        this.createD3Timeline(container, allEvents);
    }

    createD3Timeline(container, events) {
        console.log('🎨 Creating D3 timeline with', events.length, 'events');
        
        // Check if D3 is available
        if (typeof d3 === 'undefined') {
            console.error('❌ D3.js not loaded!');
            container.innerHTML = '<div class="text-red-500 text-center py-8">D3.js library not loaded. Check if CDN is working.</div>';
            return;
        }
        
        console.log('✅ D3.js available:', d3.version);
        
        const margin = {top: 20, right: 20, bottom: 40, left: 100};
        const width = Math.max(800, container.offsetWidth - margin.left - margin.right);
        const height = 400;
        
        console.log('📏 Canvas dimensions:', width, 'x', height);
        
        // Clear container and add D3 container
        container.innerHTML = '';
        
        const svg = d3.select('#timelineTracks')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        console.log('🎯 SVG created');
        
        // Group events by category
        const categories = ['cpu', 'memory', 'cache', 'function', 'sync', 'branch'];
        const categoryData = categories.map(cat => ({
            category: cat,
            events: events.filter(e => e.category === cat)
        })).filter(d => d.events.length > 0);
        
        console.log('📊 Category data:', categoryData.map(d => `${d.category}: ${d.events.length}`));
        
        if (categoryData.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No valid events to display</div>';
            return;
        }
        
        // Scales
        const maxTime = Math.max(...events.map(d => d.start + d.duration));
        console.log('⏱️ Max time:', maxTime);
        
        const xScale = d3.scaleLinear()
            .domain([0, maxTime])
            .range([0, width]);
        
        const yScale = d3.scaleBand()
            .domain(categoryData.map(d => d.category))
            .range([0, height])
            .padding(0.1);
        
        // Color scale
        const colorScale = d3.scaleOrdinal()
            .domain(categories)
            .range(['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#30cfd0']);
        
        // Add gradient definitions
        const defs = svg.append('defs');
        
        categories.forEach(cat => {
            const gradient = defs.append('linearGradient')
                .attr('id', `gradient-${cat}`)
                .attr('x1', '0%').attr('y1', '0%')
                .attr('x2', '100%').attr('y2', '0%');
            
            gradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', colorScale(cat))
                .attr('stop-opacity', 0.8);
            
            gradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', d3.color(colorScale(cat)).darker(1))
                .attr('stop-opacity', 1);
        });
        
        // Background
        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', '#1a1a1a')
            .attr('rx', 4);
        
        // Grid lines
        svg.append('g')
            .attr('class', 'grid')
            .selectAll('line')
            .data(d3.range(0, maxTime, maxTime / 10))
            .enter()
            .append('line')
            .attr('x1', d => xScale(d))
            .attr('x2', d => xScale(d))
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .attr('stroke-dasharray', '2,2');
        
        // Timeline bars with animation
        const timelineBars = svg.selectAll('.timeline-bar')
            .data(categoryData)
            .enter()
            .append('g')
            .attr('class', 'timeline-bar')
            .attr('transform', d => `translate(0,${yScale(d.category)})`);
        
        // Add category labels
        timelineBars.append('text')
            .attr('x', -10)
            .attr('y', yScale.bandwidth() / 2)
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .text(d => d.category.toUpperCase());
        
        // Add event rectangles
        timelineBars.selectAll('.event')
            .data(d => d.events)
            .enter()
            .append('rect')
            .attr('class', 'event')
            .attr('x', d => xScale(d.start))
            .attr('y', 0)
            .attr('width', 0)  // Start with 0 width for animation
            .attr('height', yScale.bandwidth())
            .attr('fill', d => `url(#gradient-${d.category})`)
            .attr('stroke', '#333')
            .attr('stroke-width', 1)
            .attr('rx', 2)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('opacity', 0.8)
                    .attr('height', yScale.bandwidth() + 4);
                
                const tooltip = document.getElementById('tooltip');
                tooltip.innerHTML = `
                    <strong>${d.name}</strong><br>
                    Line: ${d.line}<br>
                    Duration: ${analyzer.formatLatency(d.duration)}<br>
                    Category: ${d.category}<br>
                    <code>${d.original}</code>
                `;
                tooltip.style.display = 'block';
                tooltip.style.left = (event.pageX + 10) + 'px';
                tooltip.style.top = (event.pageY - 10) + 'px';
            })
            .on('mouseout', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('opacity', 1)
                    .attr('height', yScale.bandwidth());
                
                document.getElementById('tooltip').style.display = 'none';
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 50)
            .attr('width', d => Math.max(1, xScale(d.start + d.duration) - xScale(d.start)));
        
        // Add event labels for larger events
        timelineBars.selectAll('.event-label')
            .data(d => d.events.filter(e => (xScale(e.start + e.duration) - xScale(e.start)) > 30))
            .enter()
            .append('text')
            .attr('class', 'event-label')
            .attr('x', d => xScale(d.start) + 5)
            .attr('y', yScale.bandwidth() / 2)
            .attr('alignment-baseline', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .text(d => d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name)
            .style('opacity', 0)
            .transition()
            .duration(500)
            .delay((d, i) => i * 50 + 800)
            .style('opacity', 1);
        
        // X-axis
        const xAxis = d3.axisBottom(xScale)
            .tickFormat(d => analyzer.formatLatency(d))
            .ticks(10);
        
        svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis)
            .selectAll('text')
            .attr('fill', '#999')
            .attr('font-size', '10px');
        
        // Axis line
        svg.select('.x-axis .domain')
            .attr('stroke', '#666')
            .attr('stroke-width', 1);
        
        // Add title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .text('Execution Timeline');
        
        // Add interactive zoom
        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .on('zoom', function(event) {
                const newXScale = event.transform.rescaleX(xScale);
                
                // Update bars
                svg.selectAll('.event')
                    .attr('x', d => newXScale(d.start))
                    .attr('width', d => Math.max(1, newXScale(d.start + d.duration) - newXScale(d.start)));
                
                // Update labels
                svg.selectAll('.event-label')
                    .attr('x', d => newXScale(d.start) + 5);
                
                // Update axis
                svg.select('.x-axis')
                    .call(xAxis.scale(newXScale));
                
                // Update grid
                svg.selectAll('.grid line')
                    .attr('x1', d => newXScale(d))
                    .attr('x2', d => newXScale(d));
            });
        
        svg.call(zoom);
        
        // Add legend
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width - 150}, 10)`);
        
        categoryData.forEach((cat, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 20})`);
            
            legendItem.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', colorScale(cat.category))
                .attr('rx', 2);
            
            legendItem.append('text')
                .attr('x', 16)
                .attr('y', 6)
                .attr('alignment-baseline', 'middle')
                .attr('fill', '#ccc')
                .attr('font-size', '11px')
                .text(cat.category.toUpperCase());
        });
        
        console.log('D3 timeline created');
    }

    createFlameGraph() {
        const container = document.getElementById('flameGraph');
        if (container) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8 text-sm">Flame graph visualization would be implemented here</div>';
        }
    }

    showTooltip(event, eventData) {
        const tooltip = document.getElementById('tooltip');
        tooltip.innerHTML = `
            <strong>${eventData.name}</strong><br>
            Line: ${eventData.line}<br>
            Duration: ${this.formatLatency(eventData.duration)}<br>
            Category: ${eventData.category}<br>
            <code>${eventData.original}</code>
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = event.pageX + 10 + 'px';
        tooltip.style.top = event.pageY - 10 + 'px';
    }

    hideTooltip() {
        document.getElementById('tooltip').style.display = 'none';
    }

    updateStatistics(summary) {
        document.getElementById('totalOps').textContent = summary.totalOperations;
        document.getElementById('totalTime').textContent = this.formatLatency(summary.totalLatency);
        document.getElementById('maxDepth').textContent = summary.maxDepth;
        
        const hotspots = this.timelineData 
            ? Object.values(this.timelineData).flat().filter(event => 
                event.duration > (summary.totalLatency * 0.1)).length
            : 0;
        document.getElementById('hotspots').textContent = hotspots;
    }

    createPerformanceBreakdown(operations) {
        const breakdown = document.getElementById('performanceBreakdown');
        breakdown.innerHTML = '';
        
        const categoryGroups = {};
        operations.forEach(op => {
            if (!categoryGroups[op.category]) {
                categoryGroups[op.category] = [];
            }
            categoryGroups[op.category].push(op);
        });
        
        Object.entries(categoryGroups).forEach(([category, ops]) => {
            const totalTime = ops.reduce((sum, op) => sum + op.latency, 0);
            const avgTime = totalTime / ops.length;
            
            const breakdownItem = document.createElement('div');
            breakdownItem.className = 'bg-gray-800 rounded p-3';
            breakdownItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-semibold text-${this.getColorForCategory(category)}-400">${category.toUpperCase()}</span>
                        <span class="text-gray-400 text-sm ml-2">(${ops.length} operations)</span>
                    </div>
                    <div class="text-right">
                        <div class="text-yellow-400 font-semibold">${this.formatLatency(totalTime)}</div>
                        <div class="text-xs text-gray-400">avg: ${this.formatLatency(avgTime)}</div>
                    </div>
                </div>
                <div class="mt-2 h-2 bg-gray-700 rounded overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                         style="width: ${Math.min(100, (totalTime / Math.max(...operations.map(o => o.latency))) * 100)}%"></div>
                </div>
            `;
            breakdown.appendChild(breakdownItem);
        });
    }

    getColorForCategory(category) {
        const colors = {
            cpu: 'blue',
            memory: 'pink',
            cache: 'cyan',
            function: 'green',
            sync: 'red',
            branch: 'yellow'
        };
        return colors[category] || 'gray';
    }
}

// Templates
const cppTemplates = {
    basic: `#include <vector>
#include <iostream>

int main() {
    std::vector<int> data(1000);
    
    for(int i = 0; i < 1000; i++) {
        data[i] = i * 2;  // Memory write operation
    }
    
    for(int i = 0; i < 1000; i++) {
        std::cout << data[i] << std::endl;  // Memory read
    }
    
    return 0;
}`,

    vector: `#include <vector>
#include <algorithm>

void processVector(std::vector<int>& vec) {
    // Sequential access - good cache locality
    for(size_t i = 0; i < vec.size(); i++) {
        vec[i] *= 2;
    }
    
    // Random access - poor cache locality
    for(size_t i = 0; i < vec.size(); i++) {
        size_t idx = (i * 7) % vec.size();
        vec[idx] += 1;
    }
}

int main() {
    std::vector<int> data(10000);
    processVector(data);
    return 0;
}`,

    matrix: `#include <vector>

const int SIZE = 100;

void matrixMultiply() {
    std::vector<std::vector<int>> a(SIZE, std::vector<int>(SIZE));
    std::vector<std::vector<int>> b(SIZE, std::vector<int>(SIZE));
    std::vector<std::vector<int>> c(SIZE, std::vector<int>(SIZE));
    
    // Initialize matrices
    for(int i = 0; i < SIZE; i++) {
        for(int j = 0; j < SIZE; j++) {
            a[i][j] = i + j;
            b[i][j] = i * j;
        }
    }
    
    // Matrix multiplication - cache intensive
    for(int i = 0; i < SIZE; i++) {
        for(int j = 0; j < SIZE; j++) {
            for(int k = 0; k < SIZE; k++) {
                c[i][j] += a[i][k] * b[k][j];
            }
        }
    }
}

int main() {
    matrixMultiply();
    return 0;
}`,

    cache: `#include <vector>

void cacheAnalysis() {
    const int SIZE = 1024 * 1024;  // 4MB array
    std::vector<int> data(SIZE);
    
    // Sequential access - cache friendly
    long sum = 0;
    for(int i = 0; i < SIZE; i += 16) {  // Jump by cache line size
        sum += data[i];
    }
    
    // Strided access - cache thrashing
    for(int i = 0; i < SIZE; i += 1024) {  // Jump by page size
        sum += data[i];
    }
    
    // Random access - worst case
    for(int i = 0; i < 1000; i++) {
        int idx = (i * 12345) % SIZE;
        sum += data[idx];
    }
}

int main() {
    cacheAnalysis();
    return 0;
}`,

    multithreading: `#include <vector>
#include <thread>
#include <mutex>

std::vector<int> shared_data(1000);
std::mutex data_mutex;

void worker_function(int thread_id) {
    for(int i = 0; i < 100; i++) {
        // Lock contention point
        std::lock_guard<std::mutex> lock(data_mutex);
        shared_data[thread_id * 100 + i] = thread_id;
    }
}

int main() {
    const int num_threads = 4;
    std::vector<std::thread> threads;
    
    for(int i = 0; i < num_threads; i++) {
        threads.emplace_back(worker_function, i);
    }
    
    for(auto& t : threads) {
        t.join();
    }
    
    return 0;
}`
};

// Initialize Monaco Editor
let monacoEditor;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing analyzer and Monaco...');
    
    // Initialize Monaco Editor first
    require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        console.log('Monaco Editor loaded');
        
        // Create Monaco Editor
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
            value: `#include <vector>
#include <iostream>

int main() {
    std::vector<int> data(1000);
    
    for(int i = 0; i < 1000; i++) {
        data[i] = i * 2;  // Memory write operation
    }
    
    return 0;
}`,
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            bracketPairColorization: { enabled: true },
            guides: {
                indentation: true,
                bracketPairs: true
            }
        });
        
        console.log('Monaco Editor initialized');
        
        // Update fallback textarea when Monaco content changes
        monacoEditor.onDidChangeModelContent(() => {
            document.getElementById('codeInput').value = monacoEditor.getValue();
        });
        
        // Initialize analyzer after Monaco is ready
        initializeAnalyzer();
    });
    
    function initializeAnalyzer() {
        try {
            analyzer = new WorkingAnalyzer();
            console.log('Analyzer initialized');
            
            // Test button
            const analyzeBtn = document.getElementById('analyzeCode');
            if (analyzeBtn) {
                console.log('Analyze button found');
                analyzeBtn.addEventListener('click', analyzeCode);
            } else {
                console.error('Analyze button not found');
            }
            
        } catch (error) {
            console.error('Failed to initialize analyzer:', error);
        }
    }
});

function analyzeCode() {
    console.log('Analysis button clicked');
    
    // Get code from Monaco Editor if available, fallback to textarea
    const code = monacoEditor ? monacoEditor.getValue() : document.getElementById('codeInput').value;
    const analysisParams = {
        arraySize: parseInt(document.getElementById('arraySize').value) || 1000,
        loopIterations: parseInt(document.getElementById('loopIterations').value) || 1000,
        threadCount: parseInt(document.getElementById('threadCount').value) || 1,
        cacheLineSize: parseInt(document.getElementById('cacheLineSize').value) || 64
    };
    
    console.log('Code length:', code.length);
    console.log('Parameters:', analysisParams);
    
    if (!code.trim()) {
        alert('Please enter C++ code to analyze');
        return;
    }
    
    const analysisStatus = document.getElementById('analysisStatus');
    analysisStatus.textContent = 'Analyzing...';
    analysisStatus.classList.add('analyzing');
    
    setTimeout(() => {
        try {
            console.log('Starting analysis...');
            const analysisResult = analyzer.analyzeCode(code, analysisParams);
            console.log('Analysis result:', analysisResult);
            
            if (!analysisResult || !analysisResult.operations) {
                throw new Error('Analysis returned invalid result');
            }
            
            displayResults(analysisResult);
            analyzer.updateStatistics(analysisResult.summary);
            analyzer.createPerformanceBreakdown(analysisResult.operations);
            
            console.log('Creating timeline...');
            analyzer.createTimelineVisualization();
            
            console.log('Creating flame graph...');
            analyzer.createFlameGraph();
            
            document.getElementById('timelineVisualization').classList.remove('hidden');
            analysisStatus.textContent = 'Analysis complete';
            analysisStatus.classList.remove('analyzing');
            
            console.log('Analysis complete');
            
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Error analyzing code: ' + error.message + '\nCheck console for details');
            analysisStatus.textContent = 'Analysis failed';
            analysisStatus.classList.remove('analyzing');
        }
    }, 500);
}

function displayResults(analysisResult) {
    console.log('Displaying results for', analysisResult.operations.length, 'operations');
    
    const resultsContainer = document.getElementById('resultsContainer');
    
    if (analysisResult.operations.length === 0) {
        resultsContainer.innerHTML = '<div class="text-gray-500 text-center py-6">No operations detected in the code</div>';
        return;
    }
    
    const maxLatency = Math.max(...analysisResult.operations.map(o => o.latency || 0));
    
    const resultsHTML = analysisResult.operations.map(result => {
        const widthPercent = maxLatency > 0 ? Math.min(100, (result.latency / maxLatency) * 100) : 0;
        
        return `
        <div class="bg-gray-900 rounded p-2 border border-gray-700 hover:border-blue-500 transition-colors">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <span class="text-blue-400 font-mono text-xs">${result.type}</span>
                    <span class="text-gray-500 text-xs ml-2">line ${result.line}</span>
                    <span class="text-purple-400 text-xs ml-2">depth ${result.depth}</span>
                </div>
                <div class="text-right">
                    <div class="text-yellow-400 font-semibold text-xs">${result.formattedLatency}</div>
                    <div class="text-xs text-gray-400">${Math.round(result.l1Equivalents)} L1</div>
                </div>
            </div>
            <div class="text-xs text-gray-400 mb-1">${result.description}</div>
            <div class="text-xs text-gray-500 font-mono bg-gray-800 p-1 rounded">${result.original}</div>
            <div class="mt-1 h-1 bg-gray-700 rounded overflow-hidden">
                <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500" 
                     style="width: ${widthPercent}%"></div>
            </div>
        </div>
    `;
    }).join('');
    
    resultsContainer.innerHTML = resultsHTML;
    console.log('Results displayed');
}

function loadTemplate() {
    const template = document.getElementById('templateSelect').value;
    if (template && cppTemplates[template]) {
        const templateCode = cppTemplates[template];
        
        // Update Monaco Editor if available, fallback to textarea
        if (monacoEditor) {
            monacoEditor.setValue(templateCode);
        } else {
            document.getElementById('codeInput').value = templateCode;
            updateLineNumbers();
        }
        
        console.log('Template loaded:', template);
    }
}

function clearAll() {
    // Clear Monaco Editor if available, fallback to textarea
    if (monacoEditor) {
        monacoEditor.setValue('');
    } else {
        document.getElementById('codeInput').value = '';
        updateLineNumbers();
    }
    
    document.getElementById('resultsContainer').innerHTML = '<div class="text-gray-500 text-center py-6">Enter C++ code and click "Analyze Code" to see timeline visualization...</div>';
    document.getElementById('timelineVisualization').classList.add('hidden');
    document.getElementById('analysisStatus').textContent = 'Ready to analyze';
    
    document.getElementById('totalOps').textContent = '0';
    document.getElementById('totalTime').textContent = '0μs';
    document.getElementById('maxDepth').textContent = '0';
    document.getElementById('hotspots').textContent = '0';
    
    document.getElementById('templateSelect').value = '';
    console.log('All cleared');
}

function updateLineNumbers() {
    // This function is no longer needed with Monaco Editor
    // but kept for compatibility
    if (!monacoEditor) {
        const code = document.getElementById('codeInput').value;
        const lines = code.split('\n').length;
        const lineNumbersHtml = Array.from({length: lines}, (_, i) => 
            `<div class="line-number">${i + 1}</div>`
        ).join('');
        document.getElementById('lineNumbers').innerHTML = lineNumbersHtml;
    }
}

// Additional event listeners
document.getElementById('templateSelect').addEventListener('change', loadTemplate);

// Initialize (Monaco handles line numbers automatically)
console.log('Analyzer script loaded');
