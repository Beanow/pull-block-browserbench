'use strict'

var through = require('pull-through')
var Buffer = require('safe-buffer').Buffer

var SQUASH_BUFFER_THRESHOLD = 128

function lazyConcat (buffers) {
  if (buffers.length === 1) return buffers[0]
  return Buffer.concat(buffers)
}

module.exports = function block (size, opts) {
  if (!opts) opts = {}
  if (typeof size === 'object') {
    opts = size
    size = opts.size
  }
  size = size || 512

  var zeroPadding

  if (opts.nopad) {
    zeroPadding = false
  } else {
    zeroPadding = typeof opts.zeroPadding !== 'undefined' ? opts.zeroPadding : true
  }

  var buffered = []
  var bufferedBytes = 0
  var bufferSkip = 0
  var emittedChunk = false

  return through(function transform (data) {
    if (typeof data === 'number') {
      data = Buffer.from([data])
    }
    bufferedBytes += data.length
    buffered.push(data)

    while (bufferedBytes >= size) {
      var targetLength = 0
      var target = []
      var b, end, out

      if (buffered.length > SQUASH_BUFFER_THRESHOLD) {
        buffered = [
          Buffer.concat(buffered.slice(0, buffered.length - 1)),
          buffered[buffered.length - 1]
        ]
      }

      while (targetLength < size) {
        b = buffered[0]

        // Slice as much as we can from the next buffer.
        end = Math.min(bufferSkip + size - targetLength, b.length)
        out = b.slice(bufferSkip, end)
        targetLength += out.length
        target.push(out)

        if (end === b.length) {
          // If that "consumes" the buffer, remove it.
          buffered.shift()
          bufferSkip = 0
        } else {
          // Otherwise keep track of how much we used.
          bufferSkip += out.length
        }
      }

      bufferedBytes -= targetLength
      this.queue(lazyConcat(target))

      emittedChunk = true
    }
  }, function flush (end) {
    if ((opts.emitEmpty && !emittedChunk) || bufferedBytes) {
      if (zeroPadding) {
        var zeroes = Buffer.alloc(size - bufferedBytes)
        zeroes.fill(0)
        buffered.push(zeroes)
      }
      if (buffered) {
        if (buffered.length > 0) {
          // Don't copy the bufferSkip bytes through concat.
          buffered[0] = buffered[0].slice(bufferSkip)
        }

        this.queue(lazyConcat(buffered))
        buffered = null
      }
    }
    this.queue(null)
  })
}
