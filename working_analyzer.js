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
            console.log('Parsed operations:', operations.length);
            console.log('First operation sample:', operations[0]);
            
            this.timelineData = this.generateTimelineData(operations);
            console.log('Timeline data generated:', Object.keys(this.timelineData));
            
            const result = this.generateAnalysisReport(operations);
            console.log('Analysis completed, result keys:', Object.keys(result));
            console.log('Operations in result:', result.operations ? result.operations.length : 'undefined');
            return result;
        } catch (error) {
            console.error('Analysis error:', error);
            console.error('Error stack:', error.stack);
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
            if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
            
            // Array access: data[i] = value (memory write)
            if (line.match(/\w+\s*\[\s*\w+\s*\]\s*=/)) {
                operations.push({
                    type: 'memory_write',
                    name: 'Array Write',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.memory_write.latency,
                    l1Equivalents: this.operations.memory_write.latency / 1,
                    depth: 1,
                    category: 'memory',
                    description: 'Writing to array element'
                });
            }
            
            // Array access: value = data[i] (memory read)
            else if (line.match(/\w+\s*=\s*\w+\s*\[\s*\w+\s*\]/)) {
                operations.push({
                    type: 'memory_read',
                    name: 'Array Read',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.memory_read.latency,
                    l1Equivalents: this.operations.memory_read.latency / 1,
                    depth: 1,
                    category: 'memory',
                    description: 'Reading from array element'
                });
            }
            
            // Vector operations: vec.push_back(), vec.size(), etc.
            else if (line.match(/\w+\.\w+\(/)) {
                operations.push({
                    type: 'function_call',
                    name: 'Vector Method',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.function_call.latency * 2,
                    l1Equivalents: (this.operations.function_call.latency * 2) / 1,
                    depth: 1,
                    category: 'function',
                    description: 'Vector method call with potential allocation'
                });
            }
            
            // For loops: for(int i = 0; i < n; i++)
            else if (line.match(/for\s*\([^)]+\)/)) {
                const loopMatch = line.match(/for\s*\([^)]*(\w+)\s*<\s*(\w+)[^)]*\)/);
                const iterations = this.calculateLoopIterations(line);
                
                operations.push({
                    type: 'branch',
                    name: 'Loop Branch',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.branch.latency * iterations,
                    l1Equivalents: (this.operations.branch.latency * iterations) / 1,
                    depth: 1,
                    category: 'branch',
                    description: `Loop with ${iterations} iterations`
                });
                
                // Add computation inside loop
                operations.push({
                    type: 'computation',
                    name: 'Loop Body',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.computation.latency * iterations,
                    l1Equivalents: (this.operations.computation.latency * iterations) / 1,
                    depth: 2,
                    category: 'cpu',
                    description: 'Computation inside loop'
                });
            }
            
            // While loops
            else if (line.match(/while\s*\([^)]+\)/)) {
                operations.push({
                    type: 'branch',
                    name: 'While Loop',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.branch.latency * this.analysisParams.loopIterations,
                    l1Equivalents: (this.operations.branch.latency * this.analysisParams.loopIterations) / 1,
                    depth: 1,
                    category: 'branch',
                    description: 'While loop condition check'
                });
            }
            
            // Function calls
            else if (line.match(/\w+\s*\([^)]*\)/)) {
                operations.push({
                    type: 'function_call',
                    name: 'Function Call',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.function_call.latency,
                    l1Equivalents: this.operations.function_call.latency / 1,
                    depth: 1,
                    category: 'function',
                    description: 'Function call overhead'
                });
            }
            
            // Mutex operations
            else if (line.match(/mutex|lock|pthread_create|thread/)) {
                operations.push({
                    type: 'mutex_lock',
                    name: 'Synchronization',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.mutex_lock.latency,
                    l1Equivalents: this.operations.mutex_lock.latency / 1,
                    depth: 1,
                    category: 'sync',
                    description: 'Thread synchronization operation'
                });
            }
            
            // Variable assignments (potential cache operations)
            else if (line.match(/\w+\s*=\s*[^;]+;/)) {
                operations.push({
                    type: 'cache_hit',
                    name: 'Assignment',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.cache_hit.latency,
                    l1Equivalents: this.operations.cache_hit.latency / 1,
                    depth: 1,
                    category: 'cache',
                    description: 'Variable assignment (cache hit)'
                });
            }
            
            // Matrix operations (nested loops)
            else if (line.match(/matrix|Matrix/)) {
                operations.push({
                    type: 'memory_read',
                    name: 'Matrix Access',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.cache_miss.latency * 10, // Matrix operations often cause cache misses
                    l1Equivalents: (this.operations.cache_miss.latency * 10) / 1,
                    depth: 1,
                    category: 'memory',
                    description: 'Matrix memory access (potential cache miss)'
                });
            }
            
            // Template instantiation
            else if (line.match(/template|<.*>/)) {
                operations.push({
                    type: 'function_call',
                    name: 'Template Instantiation',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.function_call.latency * 5,
                    l1Equivalents: (this.operations.function_call.latency * 5) / 1,
                    depth: 1,
                    category: 'function',
                    description: 'Template compilation overhead'
                });
            }
            
            // Arithmetic operations
            else if (line.match(/[a-zA-Z_]\w*\s*[\+\-\*\/\%]\s*[a-zA-Z_]\w*/)) {
                operations.push({
                    type: 'computation',
                    name: 'Arithmetic',
                    line: lineNumber,
                    original: line,
                    latency: this.operations.computation.latency,
                    l1Equivalents: this.operations.computation.latency / 1,
                    depth: 1,
                    category: 'cpu',
                    description: 'Arithmetic computation'
                });
            }
        }
        
        // If no operations were found, add a default operation
        if (operations.length === 0) {
            operations.push({
                type: 'computation',
                name: 'Code Execution',
                line: 1,
                original: code.substring(0, 50) + (code.length > 50 ? '...' : ''),
                latency: this.operations.computation.latency * 100,
                l1Equivalents: (this.operations.computation.latency * 100) / 1,
                depth: 1,
                category: 'cpu',
                description: 'General code execution'
            });
        }
        
        console.log('Parsed operations:', operations.length);
        return operations;
    }
    
    calculateLoopIterations(loopLine) {
        // Try to extract loop bounds from the line
        const match = loopLine.match(/for\s*\([^;]*;\s*[^<]*<\s*(\d+)/);
        if (match) {
            return parseInt(match[1]);
        }
        
        // Try to match variable bounds like i < n
        const varMatch = loopLine.match(/for\s*\([^;]*;\s*\w+\s*<\s*(\w+)/);
        if (varMatch) {
            // Default to analysis parameters for variable bounds
            return this.analysisParams.loopIterations || 1000;
        }
        
        // Default to analysis parameters
        return this.analysisParams.loopIterations || 1000;
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
            let category = op.category || this.getCategoryFromType(op.type);
            
            // Handle new format operations
            if (op.latency !== undefined) {
                latency = op.latency;
            } 
            // Handle old format operations (backward compatibility)
            else if (op.impact) {
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
                    default:
                        latency = 0;
                }
            } else {
                // Fallback
                latency = op.latency || 0;
            }
            
            const event = {
                name: op.name || op.type,
                start: currentTime,
                duration: latency,
                category: category,
                line: op.line,
                original: op.original,
                description: op.description || `${op.type} operation`
            };
            
            if (timeline[category]) {
                timeline[category].push(event);
            }
            
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
            
            // Handle new format operations
            if (op.latency !== undefined) {
                latency = op.latency;
                l1Equivalents = op.l1Equivalents || 0;
            } 
            // Handle old format operations (backward compatibility)
            else if (op.impact) {
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
                    default:
                        latency = 0;
                        l1Equivalents = 0;
                }
            } else {
                // Fallback for any other format
                latency = op.latency || 0;
                l1Equivalents = op.l1Equivalents || 0;
            }
            
            totalLatency += latency;
            totalL1Equivalents += l1Equivalents;
            maxDepth = Math.max(maxDepth, op.depth || 1);
            
            return {
                ...op,
                latency,
                l1Equivalents,
                formattedLatency: this.formatLatency(latency),
                category: op.category || this.getCategoryFromType(op.type)
            };
        });
        
        // Calculate hotspots (operations with high latency)
        const avgLatency = totalLatency / detailedOps.length;
        const hotspots = detailedOps.filter(op => op.latency > avgLatency * 2).length;
        
        return {
            operations: detailedOps,
            summary: {
                totalLatency,
                totalL1Equivalents,
                memoryAccesses,
                maxDepth,
                hotspots,
                averageLatency: avgLatency,
                operationCount: detailedOps.length
            }
        };
    }
    
    getCategoryFromType(type) {
        const categoryMap = {
            'memory_read': 'memory',
            'memory_write': 'memory',
            'cache_hit': 'cache',
            'cache_miss': 'cache',
            'computation': 'cpu',
            'function_call': 'function',
            'branch': 'branch',
            'mutex_lock': 'sync',
            'synchronization': 'sync'
        };
        return categoryMap[type] || 'cpu';
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
        console.log('Creating D3 timeline with', events.length, 'events');
        
        // Check if D3 is available
        if (typeof d3 === 'undefined') {
            console.error('D3.js not loaded!');
            container.innerHTML = '<div class="text-red-500 text-center py-8">D3.js library not loaded. Check if CDN is working.</div>';
            return;
        }
        
        console.log('D3.js available:', d3.version);
        
        const margin = {top: 40, right: 20, bottom: 60, left: 100};
        const width = Math.max(800, container.offsetWidth - margin.left - margin.right);
        const height = 400;
        
        console.log('Canvas dimensions:', width, 'x', height);
        
        // Clear container and add D3 container
        container.innerHTML = '';
        
        // Add controls
        this.addTimelineControls(container);
        
        const svg = d3.select('#timelineTracks')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        console.log('SVG created');
        
        // Group events by category
        const categories = ['cpu', 'memory', 'cache', 'function', 'sync', 'branch'];
        const categoryData = categories.map(cat => ({
            category: cat,
            events: events.filter(e => e.category === cat)
        })).filter(d => d.events.length > 0);
        
        console.log('Category data:', categoryData.map(d => `${d.category}: ${d.events.length}`));
        
        if (categoryData.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8">No valid events to display</div>';
            return;
        }
        
        // Scales
        const maxTime = Math.max(...events.map(d => d.start + d.duration));
        console.log('Max time:', maxTime);
        
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
            .attr('y', -15)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .text('Execution Timeline');
        
        // Store scales for controls
        this.timelineScales = { xScale, yScale, originalXScale: xScale.copy() };
        
        // Add interactive zoom
        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .on('zoom', function(event) {
                const newXScale = event.transform.rescaleX(analyzer.timelineScales.originalXScale);
                analyzer.timelineScales.xScale = newXScale;
                
                // Update bars
                svg.selectAll('.event')
                    .attr('x', d => newXScale(d.start))
                    .attr('width', d => Math.max(1, newXScale(d.start + d.duration) - newXScale(d.start)));
                
                svg.selectAll('.event-label')
                    .attr('x', d => newXScale(d.start) + 5);
                
                svg.select('.x-axis')
                    .call(d3.axisBottom(analyzer.timelineScales.xScale).tickFormat(d => analyzer.formatLatency(d)));
                
                svg.selectAll('.grid line')
                    .attr('x1', d => newXScale(d))
                    .attr('x2', d => newXScale(d));
            });
        
        svg.call(zoom);
        
        // Add legend
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width - 150}, -15)`);
        
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
        
        console.log('D3 timeline created successfully');
    }
    
    addTimelineControls(container) {
        const controls = document.createElement('div');
        controls.className = 'flex justify-between items-center mb-3';
        controls.innerHTML = `
            <div class="flex space-x-2">
                <button id="timeline-zoom-in" class="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs">Zoom In</button>
                <button id="timeline-zoom-out" class="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs">Zoom Out</button>
                <button id="timeline-reset" class="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs">Reset</button>
            </div>
            <div class="flex space-x-2">
                <button id="timeline-export" class="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs">Export SVG</button>
                <button id="timeline-screenshot" class="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs">Screenshot</button>
            </div>
        `;
        
        container.insertBefore(controls, container.firstChild);
        
        // Add event listeners
        setTimeout(() => {
            document.getElementById('timeline-zoom-in')?.addEventListener('click', () => {
                this.zoomTimeline(1.5);
            });
            
            document.getElementById('timeline-zoom-out')?.addEventListener('click', () => {
                this.zoomTimeline(0.67);
            });
            
            document.getElementById('timeline-reset')?.addEventListener('click', () => {
                this.resetTimelineZoom();
            });
            
            document.getElementById('timeline-export')?.addEventListener('click', () => {
                this.exportTimelineSVG();
            });
            
            document.getElementById('timeline-screenshot')?.addEventListener('click', () => {
                this.takeTimelineScreenshot();
            });
        }, 100);
    }
    
    zoomTimeline(factor) {
        if (!this.timelineScales) return;
        
        const svg = d3.select('#timelineTracks svg g');
        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .on('zoom', function(event) {
                const newXScale = event.transform.rescaleX(analyzer.timelineScales.originalXScale);
                analyzer.timelineScales.xScale = newXScale;
                
                // Update all elements
                svg.selectAll('.event')
                    .attr('x', d => newXScale(d.start))
                    .attr('width', d => Math.max(1, newXScale(d.start + d.duration) - newXScale(d.start)));
                
                svg.selectAll('.event-label')
                    .attr('x', d => newXScale(d.start) + 5);
                
                svg.select('.x-axis')
                    .call(d3.axisBottom(analyzer.timelineScales.xScale).tickFormat(d => analyzer.formatLatency(d)));
                
                svg.selectAll('.grid line')
                    .attr('x1', d => newXScale(d))
                    .attr('x2', d => newXScale(d));
            });
        
        svg.transition().duration(300).call(zoom.scaleBy, factor);
    }
    
    resetTimelineZoom() {
        if (!this.timelineScales) return;
        
        const svg = d3.select('#timelineTracks svg g');
        const zoom = d3.zoom()
            .scaleExtent([0.5, 10])
            .on('zoom', function(event) {
                const newXScale = event.transform.rescaleX(analyzer.timelineScales.originalXScale);
                analyzer.timelineScales.xScale = newXScale;
                
                // Update all elements
                svg.selectAll('.event')
                    .attr('x', d => newXScale(d.start))
                    .attr('width', d => Math.max(1, newXScale(d.start + d.duration) - newXScale(d.start)));
                
                svg.selectAll('.event-label')
                    .attr('x', d => newXScale(d.start) + 5);
                
                svg.select('.x-axis')
                    .call(d3.axisBottom(analyzer.timelineScales.xScale).tickFormat(d => analyzer.formatLatency(d)));
                
                svg.selectAll('.grid line')
                    .attr('x1', d => newXScale(d))
                    .attr('x2', d => newXScale(d));
            });
        
        svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    }
    
    exportTimelineSVG() {
        const svg = document.querySelector('#timelineTracks svg');
        if (!svg) return;
        
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline.svg';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    takeTimelineScreenshot() {
        const svg = document.querySelector('#timelineTracks svg');
        if (!svg) return;
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const svgData = new XMLSerializer().serializeToString(svg);
        
        // Convert SVG to image
        const img = new Image();
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            // Download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'timeline.png';
                a.click();
                URL.revokeObjectURL(url);
            });
        };
        
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }

    createFlameGraph() {
        const container = document.getElementById('flameGraph');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Check if d3-flame-graph is available
        if (typeof d3flamegraph === 'undefined') {
            container.innerHTML = '<div class="text-gray-500 text-center py-8 text-sm">Flame graph library not loaded</div>';
            return;
        }
        
        // Generate flame graph data from timeline data
        const flameData = this.generateFlameGraphData();
        
        if (!flameData || flameData.children.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-8 text-sm">No data available for flame graph</div>';
            return;
        }
        
        // Create flame graph
        const chart = d3flamegraph()
            .width(container.offsetWidth)
            .height(300)
            .cellHeight(18)
            .minCellWidth(2)
            .transitionDuration(250)
            .sort(false)
            .inverted(true);
        
        // Set up tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'flamegraph-tooltip')
            .style('position', 'absolute')
            .style('visibility', 'hidden')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('font-size', '11px')
            .style('font-family', 'Inter, monospace');
        
        chart.tooltip((d) => {
            const percentage = ((d.value / flameData.value) * 100).toFixed(2);
            return `${d.name}<br/>Time: ${this.formatLatency(d.value)}<br/>Percentage: ${percentage}%`;
        });
        
        // Render the chart
        d3.select(container)
            .datum(flameData)
            .call(chart);
        
        // Add zoom controls
        this.addFlameGraphControls(container, chart);
        
        console.log('Flame graph created successfully');
    }
    
    generateFlameGraphData() {
        if (!this.timelineData || this.timelineData.length === 0) {
            return null;
        }
        
        // Convert timeline data to flame graph format
        const root = {
            name: 'main()',
            value: 0,
            children: []
        };
        
        // Group operations by type and create hierarchy
        const categories = {
            'memory': { name: 'Memory Operations', value: 0, children: [] },
            'cpu': { name: 'CPU Operations', value: 0, children: [] },
            'cache': { name: 'Cache Operations', value: 0, children: [] },
            'function': { name: 'Function Calls', value: 0, children: [] },
            'sync': { name: 'Synchronization', value: 0, children: [] },
            'branch': { name: 'Branch Operations', value: 0, children: [] }
        };
        
        this.timelineData.forEach(event => {
            const category = categories[event.category];
            if (category) {
                category.value += event.duration;
                category.children.push({
                    name: `${event.name} (line ${event.line})`,
                    value: event.duration,
                    data: event
                });
            }
        });
        
        // Add non-empty categories to root
        Object.values(categories).forEach(category => {
            if (category.value > 0) {
                root.children.push(category);
                root.value += category.value;
            }
        });
        
        return root.value > 0 ? root : null;
    }
    
    addFlameGraphControls(container, chart) {
        const controls = document.createElement('div');
        controls.className = 'flex justify-center space-x-2 mt-3';
        controls.innerHTML = `
            <button id="flame-reset" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs">Reset Zoom</button>
            <button id="flame-download" class="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs">Download SVG</button>
        `;
        
        container.appendChild(controls);
        
        // Add event listeners
        document.getElementById('flame-reset').addEventListener('click', () => {
            chart.resetZoom();
        });
        
        document.getElementById('flame-download').addEventListener('click', () => {
            const svg = container.querySelector('svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'flame-graph.svg';
                a.click();
                URL.revokeObjectURL(url);
            }
        });
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
        Swal.fire({
            icon: 'warning',
            title: 'No Code',
            text: 'Please enter C++ code to analyze',
            confirmButtonColor: '#3b82f6',
            background: '#1f2937',
            color: '#fff'
        });
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
            
            // Store results for export and comparison
            analyzer.lastAnalysisResult = analysisResult;
            
            if (compareMode && compareResults) {
                // Show comparison view
                displayComparisonResults(compareResults, analysisResult);
            } else {
                // Show normal results
                displayResults(analysisResult);
                analyzer.updateStatistics(analysisResult.summary);
                analyzer.createPerformanceBreakdown(analysisResult.operations);
            }
            
            console.log('Creating timeline...');
            analyzer.createTimelineVisualization();
            
            console.log('Creating flame graph...');
            analyzer.createFlameGraph();
            
            document.getElementById('timelineVisualization').classList.remove('hidden');
            analysisStatus.textContent = compareMode ? 'Comparison complete' : 'Analysis complete';
            analysisStatus.classList.remove('analyzing');
            
            console.log('Analysis complete');
            
            // Show success notification
            Swal.fire({
                icon: 'success',
                title: compareMode ? 'Comparison Complete!' : 'Analysis Complete!',
                text: `Found ${analysisResult.operations.length} operations`,
                timer: 2000,
                showConfirmButton: false,
                position: 'top-end',
                toast: true,
                background: '#1f2937',
                color: '#fff'
            });
            
        } catch (error) {
            console.error('Analysis error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Analysis Failed',
                text: error.message,
                footer: 'Check console for details',
                confirmButtonColor: '#ef4444',
                background: '#1f2937',
                color: '#fff'
            });
            analysisStatus.textContent = 'Analysis failed';
            analysisStatus.classList.remove('analyzing');
        }
    }, 500);
}

function displayComparisonResults(result1, result2) {
    const container = document.getElementById('resultsContainer');
    
    const comparisonHTML = `
        <div class="space-y-4">
            <div class="bg-gray-900 rounded p-3">
                <h3 class="text-sm font-medium text-gray-300 mb-2">Performance Comparison</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <h4 class="text-xs font-medium text-blue-400 mb-1">Original Code</h4>
                        <div class="space-y-1">
                            <div class="text-xs">Operations: ${result1.operations.length}</div>
                            <div class="text-xs">Time: ${result1.summary.totalLatency.toFixed(2)}ns</div>
                            <div class="text-xs">Hotspots: ${result1.summary.hotspots}</div>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-xs font-medium text-green-400 mb-1">Modified Code</h4>
                        <div class="space-y-1">
                            <div class="text-xs">Operations: ${result2.operations.length}</div>
                            <div class="text-xs">Time: ${result2.summary.totalLatency.toFixed(2)}ns</div>
                            <div class="text-xs">Hotspots: ${result2.summary.hotspots}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="bg-gray-900 rounded p-3">
                <h3 class="text-sm font-medium text-gray-300 mb-2">Performance Change</h3>
                <div class="space-y-2">
                    ${generateComparisonMetrics(result1, result2)}
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <h4 class="text-xs font-medium text-blue-400 mb-1">Original Operations</h4>
                    <div class="space-y-1 max-h-40 overflow-auto">
                        ${result1.operations.slice(0, 5).map(op => `
                            <div class="text-xs text-gray-400">
                                ${op.name}: ${op.formattedLatency}
                            </div>
                        `).join('')}
                        ${result1.operations.length > 5 ? `<div class="text-xs text-gray-500">... and ${result1.operations.length - 5} more</div>` : ''}
                    </div>
                </div>
                <div>
                    <h4 class="text-xs font-medium text-green-400 mb-1">Modified Operations</h4>
                    <div class="space-y-1 max-h-40 overflow-auto">
                        ${result2.operations.slice(0, 5).map(op => `
                            <div class="text-xs text-gray-400">
                                ${op.name}: ${op.formattedLatency}
                            </div>
                        `).join('')}
                        ${result2.operations.length > 5 ? `<div class="text-xs text-gray-500">... and ${result2.operations.length - 5} more</div>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = comparisonHTML;
}

function generateComparisonMetrics(result1, result2) {
    const timeDiff = result2.summary.totalLatency - result1.summary.totalLatency;
    const timePercent = (timeDiff / result1.summary.totalLatency * 100).toFixed(1);
    const opsDiff = result2.operations.length - result1.operations.length;
    const hotspotsDiff = result2.summary.hotspots - result1.summary.hotspots;
    
    const timeClass = timeDiff < 0 ? 'text-green-400' : 'text-red-400';
    const timeSymbol = timeDiff < 0 ? '↓' : '↑';
    const opsClass = opsDiff < 0 ? 'text-green-400' : 'text-red-400';
    const opsSymbol = opsDiff < 0 ? '↓' : '↑';
    
    return `
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-400">Total Time:</span>
            <span class="text-xs ${timeClass}">${timeSymbol} ${Math.abs(timePercent)}%</span>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-400">Operations:</span>
            <span class="text-xs ${opsClass}">${opsSymbol} ${Math.abs(opsDiff)}</span>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-xs text-gray-400">Hotspots:</span>
            <span class="text-xs ${hotspotsDiff < 0 ? 'text-green-400' : 'text-red-400'}">
                ${hotspotsDiff < 0 ? '↓' : '↑'} ${Math.abs(hotspotsDiff)}
            </span>
        </div>
    `;
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
document.getElementById('compareMode').addEventListener('click', toggleCompareMode);
document.getElementById('exportJSON').addEventListener('click', exportResultsJSON);
document.getElementById('shareResults').addEventListener('click', shareResults);
document.getElementById('printReport').addEventListener('click', printReport);

// Compare mode functionality
let compareMode = false;
let compareResults = null;

function toggleCompareMode() {
    compareMode = !compareMode;
    const compareBtn = document.getElementById('compareMode');
    const analyzeBtn = document.getElementById('analyzeCode');
    
    if (compareMode) {
        compareBtn.textContent = 'Exit Compare';
        compareBtn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
        compareBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        analyzeBtn.textContent = 'Compare Results';
        
        // Store current results if they exist
        if (analyzer && analyzer.lastAnalysisResult) {
            compareResults = analyzer.lastAnalysisResult;
        }
    } else {
        compareBtn.textContent = 'Compare';
        compareBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        compareBtn.classList.add('bg-purple-600', 'hover:bg-purple-700');
        analyzeBtn.textContent = 'Run';
        compareResults = null;
    }
}

function exportResultsJSON() {
    if (!analyzer || !analyzer.lastAnalysisResult) {
        Swal.fire({
            icon: 'warning',
            title: 'No Results',
            text: 'No analysis results to export',
            confirmButtonColor: '#3b82f6',
            background: '#1f2937',
            color: '#fff'
        });
        return;
    }
    
    const exportData = {
        timestamp: new Date().toISOString(),
        code: monacoEditor ? monacoEditor.getValue() : document.getElementById('codeInput').value,
        parameters: analyzer.analysisParams,
        results: analyzer.lastAnalysisResult,
        timelineData: analyzer.timelineData
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpp-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    Swal.fire({
        icon: 'success',
        title: 'Exported!',
        text: 'Analysis results exported as JSON',
        timer: 2000,
        showConfirmButton: false,
        position: 'top-end',
        toast: true,
        background: '#1f2937',
        color: '#fff'
    });
}

function shareResults() {
    if (!analyzer || !analyzer.lastAnalysisResult) {
        Swal.fire({
            icon: 'warning',
            title: 'No Results',
            text: 'No analysis results to share',
            confirmButtonColor: '#3b82f6',
            background: '#1f2937',
            color: '#fff'
        });
        return;
    }
    
    // Create shareable link with encoded data
    const shareData = {
        code: monacoEditor ? monacoEditor.getValue() : document.getElementById('codeInput').value,
        parameters: analyzer.analysisParams
    };
    
    const encoded = btoa(JSON.stringify(shareData));
    const shareUrl = `${window.location.origin}${window.location.pathname}?data=${encoded}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
        Swal.fire({
            icon: 'success',
            title: 'Link Copied!',
            text: 'Share link copied to clipboard',
            timer: 2000,
            showConfirmButton: false,
            position: 'top-end',
            toast: true,
            background: '#1f2937',
            color: '#fff'
        });
    }).catch(() => {
        Swal.fire({
            icon: 'info',
            title: 'Share Link',
            input: 'text',
            inputValue: shareUrl,
            showCloseButton: true,
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            background: '#1f2937',
            color: '#fff',
            confirmButtonText: 'Copy',
            preConfirm: () => {
                navigator.clipboard.writeText(shareUrl);
                Swal.fire({
                    icon: 'success',
                    title: 'Copied!',
                    timer: 1000,
                    showConfirmButton: false,
                    position: 'top-end',
                    toast: true,
                    background: '#1f2937',
                    color: '#fff'
                });
            }
        });
    });
}

function printReport() {
    if (!analyzer || !analyzer.lastAnalysisResult) {
        Swal.fire({
            icon: 'warning',
            title: 'No Results',
            text: 'No analysis results to print',
            confirmButtonColor: '#3b82f6',
            background: '#1f2937',
            color: '#fff'
        });
        return;
    }
    
    Swal.fire({
        title: 'Generate Report',
        text: 'Create a printable performance report?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Generate',
        background: '#1f2937',
        color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            const results = analyzer.lastAnalysisResult;
            const printWindow = window.open('', '_blank');
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>C++ Performance Analysis Report</title>
                    <style>
                        body { font-family: 'Inter', monospace; margin: 20px; }
                        .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        .section { margin-bottom: 20px; }
                        .metric { display: inline-block; margin: 10px; padding: 10px; border: 1px solid #ddd; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>C++ Performance Analysis Report</h1>
                        <p>Generated: ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <div class="section">
                        <h2>Summary</h2>
                        <div class="metric">
                            <strong>Total Operations:</strong> ${results.operations.length}
                        </div>
                        <div class="metric">
                            <strong>Total Time:</strong> ${formatLatency(results.summary.totalLatency)}
                        </div>
                        <div class="metric">
                            <strong>Max Depth:</strong> ${results.summary.maxDepth}
                        </div>
                        <div class="metric">
                            <strong>Hotspots:</strong> ${results.summary.hotspots}
                        </div>
                    </div>
                    
                    <div class="section">
                        <h2>Analysis Parameters</h2>
                        <table>
                            <tr><th>Parameter</th><th>Value</th></tr>
                            <tr><td>Array Size</td><td>${analyzer.analysisParams.arraySize}</td></tr>
                            <tr><td>Loop Iterations</td><td>${analyzer.analysisParams.loopIterations}</td></tr>
                            <tr><td>Thread Count</td><td>${analyzer.analysisParams.threadCount}</td></tr>
                            <tr><td>Cache Line Size</td><td>${analyzer.analysisParams.cacheLineSize}</td></tr>
                        </table>
                    </div>
                    
                    <div class="section">
                        <h2>Operations Breakdown</h2>
                        <table>
                            <tr><th>Type</th><th>Name</th><th>Line</th><th>Latency</th><th>L1 Equivalents</th><th>Description</th></tr>
                            ${results.operations.map(op => `
                                <tr>
                                    <td>${op.type}</td>
                                    <td>${op.name}</td>
                                    <td>${op.line}</td>
                                    <td>${op.formattedLatency}</td>
                                    <td>${Math.round(op.l1Equivalents)}</td>
                                    <td>${op.description}</td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                    
                    <div class="section">
                        <h2>Code</h2>
                        <pre style="background: #f5f5f5; padding: 10px; overflow-x: auto;">${monacoEditor ? monacoEditor.getValue() : document.getElementById('codeInput').value}</pre>
                    </div>
                </body>
                </html>
            `);
            
            printWindow.document.close();
            printWindow.print();
            
            Swal.fire({
                icon: 'success',
                title: 'Report Generated!',
                text: 'Print dialog opened',
                timer: 2000,
                showConfirmButton: false,
                position: 'top-end',
                toast: true,
                background: '#1f2937',
                color: '#fff'
            });
        }
    });
}

function formatLatency(nanoseconds) {
    if (nanoseconds < 1000) {
        return `${nanoseconds.toFixed(1)}ns`;
    } else if (nanoseconds < 1000000) {
        return `${(nanoseconds / 1000).toFixed(2)}μs`;
    } else {
        return `${(nanoseconds / 1000000).toFixed(2)}ms`;
    }
}

// Initialize (Monaco handles line numbers automatically)
console.log('Analyzer script loaded');

// Show welcome toast
window.addEventListener('load', () => {
    setTimeout(() => {
        Swal.fire({
            icon: 'info',
            title: 'Welcome to C++ Performance Analyzer!',
            text: 'Enter your C++ code and click Run to analyze performance',
            timer: 3000,
            showConfirmButton: false,
            position: 'top-end',
            toast: true,
            background: '#1f2937',
            color: '#fff'
        });
    }, 1000);
});
