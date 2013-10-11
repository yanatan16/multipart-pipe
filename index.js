// multipart-pipe/index.js
// Pipe multipart uploads to a file server without touching disk!

// builtin
var path = require('path')

// vendor
var uuid = require('uuid'),
  knox = require('knox')

module.exports = pipe


function pipe(options) {
  options = defaults(options)

  var typetest = options['content-type'],
    fngen = options.filename,
    streamer = options.streamer

  return function (req, res, next) {
    if (req.form) {
      var filenames = {},
        refnext = new Refcount(next)

      req.uploaded_files = {}

      req.form.on('error', function (err) {
        err.status = 400
        refnext.cancel(err)
      })
      .on('part', function (part) {
        if (typetest.test(part.headers['content-type']) && part.filename) {
          var filename = filenames[part.filename] = (filenames[part.filename] || fngen(part.filename))
          refnext.incr();

          streamer(part, filename, function (err) {
            if (err) {
              err.status = 500
              return refnext.cancel(err)
            }
            req.uploaded_files[part.filename] = filename;
            refnext.decr()
          })
        }
      })
      .on('close', function () {
        refnext.close()
      })
    } else {
      next()
    }
  }
}

pipe.s3 = function pipes3(s3opts, opts) {
  opts.streamer = s3streamer(s3opts)
  return pipe(opts)
}

// -- helpers --

// Set default options
function defaults(opts) {
  opts = opts || {}
  opts['content-type'] = (function (ct) { return ct instanceof RegExp ? ct : new RegExp(ct || '.*') })(opts['content-type'])
  opts.filename = opts.filename || function (fn) { return uuid.v4() + path.extname(fn) }

  if (!opts.streamer) {
    throw new Error('No streamer found. Must pass a streamer to multipart-pipe')
  }

  return opts
}

// An s3 streamer
function s3streamer(opts) {
  var s3 = knox.createClient(opts),
    headers = opts.headers || { 'x-amz-acl': 'public-read' }

  return function (part, filename, callback) {
    headers['Content-Length'] = part.byteCount
    headers['Content-Type'] = part.headers['content-type']
    s3.putStream(part, filename, headers, function (err, s3resp) {
      if (err) {
        return callback(err)
      } else if (s3resp.statusCode < 200 || s3resp.statusCode > 299) {
        return callback(new Error('Error uploading to s3: ' + s3resp.statusCode), s3resp)
      }
      s3resp.resume() // This finalizes the stream response
      callback()
    })
  }
}

// Refcount is a reference-counted callback wrapper
// It will only call back when count === 0 and close() has been called
// Unless .cancel(err) is called, which will call immediately and never again
function Refcount(cb) {
  this.count = 0
  this.closed = false
  this.cancel = false
  this.cb = cb
}
Refcount.prototype.incr = function () {
  this.count++
}
Refcount.prototype.decr = function () {
  this.count--
  this.maybecall()
}
Refcount.prototype.close = function () {
  this.closed = true
  this.maybecall()
}
Refcount.prototype.cancel = function (err) {
  if (!this.cancel) {
    this.cancel = true
    this.cb(err)
  }
}
Refcount.prototype.maybecall = function () {
  if (!this.cancel && this.closed && this.count === 0) {
    this.cb()
  }
}