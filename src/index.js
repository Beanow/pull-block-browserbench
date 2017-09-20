var Buffer = require('safe-buffer').Buffer
var markdown = require('markdown').parse
var pull = require('pull-stream')

var q = Promise.resolve()
var KB = 1024
var MB = KB * 1024

var currentEl = document.getElementById('current')
var resultsEl = document.getElementById('results')
var previewEl = document.getElementById('preview')
var runEl = document.getElementById('run')
currentEl.textContent = 'Ready'
runEl.onclick = runTests

var tests = {
	singleRemainder: test({
		inSize: 150*MB,
		inCount: 1,
		blockSize: 160*MB,
		zeroPadding: false
	}),
	bigRemainder: test({
		inSize: 200*MB,
		inCount: 1,
		blockSize: 101*MB,
		zeroPadding: false
	}),
	perfectHalves: test({
		inSize: 10*MB,
		inCount: 25,
		blockSize: 5*MB
	}),
	almostHalves: test({
		inSize: 10*MB,
		inCount: 25,
		blockSize: 4*MB
	}),
	perfect10ths: test({
		inSize: 10*MB,
		inCount: 25,
		blockSize: 1*MB
	}),
	almost10ths: test({
		inSize: 10*MB,
		inCount: 25,
		blockSize: 950*KB
	}),
	perfect100ths: test({
		inSize: 25*MB,
		inCount: 12,
		blockSize: 256*KB
	}),
	almost100ths: test({
		inSize: 25*MB,
		inCount: 12,
		blockSize: 200*KB
	}),
	hugeBuffers: test({
		inSize: 200*MB,
		inCount: 2,
		blockSize: 500*KB
	}),
	tinyBufs: test({
		inSize: 7*KB,
		inCount: 20000,
		blockSize: 40*KB
	}),
	microBufs: test({
		inSize: 512,
		inCount: 50000,
		blockSize: 40*KB
	}),
	manyPairs: test({
		inSize: 16*KB,
		inCount: 10000,
		blockSize: 30*KB
	}),
	perfectPairs: test({
		inSize: 15*KB,
		inCount: 10000,
		blockSize: 30*KB
	}),
	manyTriplets: test({
		inSize: 11*KB,
		inCount: 14000,
		blockSize: 30*KB
	}),
	bigBuffers: test({
		inSize: 20*MB,
		inCount: 1,
		blockSize: 50*KB
	})
}
var implementations = {
	'master': require('./pull-block-master.js'),
	'dev': require('./pull-block-dev.js')
	// 'v1.2.0': require('./pull-block-1.2.0.js')
}
var repeat = 12
var wait = {
	afterSetup: waitFor(1000),
	afterRun: waitFor(200),
	beforeSetup: waitFor(200)
}

function showButton(predicate) {
	return function(passThrough) {
		runEl.style.display = predicate ? 'inline-block' : 'none'
		return passThrough
	}
}

function setCurrent(text) {
	return function(passThrough) {
		currentEl.textContent = text
		return passThrough
	}
}

function clearResults(passThrough) {
	resultsEl.innerHTML = ''
	return passThrough
}

function addMDLine() {
	var line = ''
	for(var i in arguments) line += (i > 0 ? '|' : '') + arguments[i]
	line += '\n'
	resultsEl.textContent += line
	previewEl.innerHTML = markdown(resultsEl.textContent, 'Maruku')
}

function addResult(test, impl, results) {
	return function(passThrough) {
		var stat = results.reduce(function(stat, val){
			return {
				sum: stat.sum + val,
				max: stat.max != null ? Math.max(stat.max, val) : val,
				min: stat.min != null ? Math.min(stat.min, val) : val
			}
		}, {sum: 0, max: null, min: null})
		var max = Math.round(stat.max)+'ms'
		var min = Math.round(stat.min)+'ms'
		var wavg = Math.round((stat.sum - stat.max - stat.min) / (results.length-2))+'ms'
		if(resultsEl.textContent == ''){
			addMDLine('Test', 'Version', 'Min', 'AVG', 'Max')
			addMDLine('-', '-', '-:', '-:', '-:')
		}
		addMDLine(test, impl, min, wavg, max)
		return passThrough
	}
}

function addFail(test, impl) {
	return function(error) {
		addMDLine(test, impl, '', '', 'failed: '+error.toString())
	}
}

function waitFor(time) {
	return function(passThrough) {
		return new Promise(function(resolve, reject){
			setTimeout(function(){
				resolve(passThrough)
			}, time)
		})
	}
}

function test(opts) {
	return function setup(){
		console.log('Setting up', opts)
		var input = []

		for(var j = 0; j < opts.inCount; j++) {
			var buf = Buffer.alloc(opts.inSize)
			for (var i = 0; i < opts.inSize; i++) buf[i] = 'a'.charCodeAt(0)
			input.push(buf)
		}

		return {
			input: input,
			blockSize: opts.blockSize,
			zeroPadding: opts.zeroPadding,
			results: []
		}
	}
}

function runWith(blockImpl, results){
	return function(context) {
		return new Promise(function(resolve, reject){
			var start = performance.now()
			pull(
				pull.values(context.input),
				blockImpl(context.blockSize, {zeroPadding: context.zeroPadding}),
				pull.onEnd(function(){
					results.push(performance.now() - start)
					resolve(context)
				})
			)
		})
	}
}

function teardown(context) {
	context.input.forEach(function(b){
		delete b
	})
	delete context.input
	return context
}

function runTests(){
	q = q
	.then(showButton(false))
	.then(clearResults)

	for (var testKey in tests) {
		var test = tests[testKey]
		var context = null
		
		q = q
		.then(setCurrent('Setting up '+testKey+' test'))
		.then(wait.beforeSetup)
		.then(test)
		.then(function(c){
			// Keep a reference to the setup, in case of errors.
			context = c
			return c
		})
		.then(wait.afterSetup)

		for (var implKey in implementations){
			var blockImpl = implementations[implKey]
			var results = []

			for (var r = 1; r <= repeat; r++){
				q = q
				q = q.then(setCurrent('Running '+testKey+' with '+implKey+' ['+r+'/'+repeat+']'))
				.then(runWith(blockImpl, results))
				.then(wait.afterRun)
			}

			q = q
			.then(addResult(testKey, implKey, results))
			.catch(addFail(testKey, implKey, context))
			.then(function(c){ return c || context })
		}

		q = q.then(teardown)
	}

	q = q
	.then(setCurrent('Tests completed'))
	.then(showButton(true))
}