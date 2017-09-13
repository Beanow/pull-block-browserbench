var Buffer = require('safe-buffer').Buffer
var pull = require('pull-stream')

var q = Promise.resolve()
var KB = 1024
var MB = KB * 1024

var currentEl = document.getElementById('current')
var resultsEl = document.getElementById('results')
var runEl = document.getElementById('run')
currentEl.textContent = 'Ready'
runEl.onclick = runTests

var tests = {
	// Suspected worst-case.
	manyPairs: test({
		inSize: 16*KB,
		inCount: 10000,
		blockSize: 30*KB
	}),

	// Suspected worst-case.
	manyTriplets: test({
		inSize: 11*KB,
		inCount: 14000,
		blockSize: 30*KB
	}),

	// Large incoming buffers scenario.
	bigBuffers: test({
		inSize: 20*MB,
		inCount: 1,
		blockSize: 50*KB
	})
}
var implementations = {
	'pull-block dev': require('./pull-block-dev.js'),
	'pull-block master': require('./pull-block-master.js'),
	'pull-block v1.2.0': require('./pull-block-1.2.0.js')
}
var repeat = 6
var wait = {
	afterSetup: waitFor(1000),
	afterRun: waitFor(300),
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

function addResult(test, impl, results) {
	return function(passThrough) {
		var p = document.createElement('p')
		var sum = results.reduce(function(acc, val){ return acc + val }, 0)
		var avg = Math.round(sum / results.length)
		p.textContent = 'Test '+test+' with '+impl+' ran an average of '+avg+'ms'
		resultsEl.appendChild(p)
		return passThrough
	}
}

function addFail(test, impl) {
	return function(error) {
		var p = document.createElement('p')
		p.textContent = 'Test '+test+' with '+impl+' failed: '+error.toString()
		resultsEl.appendChild(p)
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
		var input = []

		for(var j = 0; j < opts.inCount; j++) {
			var buf = Buffer.alloc(opts.inSize)
			for (var i = 0; i < opts.inSize; i++) buf[i] = 'a'.charCodeAt(0)
			input.push(buf)
		}

		return {
			input: input,
			blockSize: opts.blockSize,
			results: []
		}
	}
}

function runWith(blockImpl, results){
	return function(context) {
		return new Promise(function(resolve, reject){
			var start = Date.now()
			pull(
				pull.values(context.input),
				blockImpl(context.blockSize),
				pull.onEnd(function(){
					results.push(Date.now() - start)
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