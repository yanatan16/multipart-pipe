// multipart-pipe/index.js
// Pipe multipart uploads to a file server without touching disk!

// vendor
var Busboy = require('busboy'),
  parseBytes = require('bytes');

module.exports = pipe

function pipe(options) {
  options = defaults(options)

  var typetest = options.allow,
    fngen = options.filename,
    limit = options.limit,
    streamer = options.streamer

  return function (req, res, next) {
    if (req.method !== 'POST')
      return callnext()

    req.form = {}
    req.files = {}

    var refnext = new Refcount(next)

    var busboy = new Busboy({ headers: req.headers, limits: {fileSize: limit} })
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
      if (!filename || !file)
        return
      if (!typetest.test(mimetype)) return; // not allowed by user

      refnext.incr()

      var fn = fngen(filename, mimetype, req)
      streamer(file, fn, mimetype, encoding, function (err) {
        if (err) {
          refnext.cancel(err, 500)
        }

        req.files[filename] = fn
        refnext.decr()
      })
    })

    busboy.on('field', function (name, value) {
      req.form[name] = value;
    })

    busboy.on('finish', function() {
      res.set('Connection', 'close')
      refnext.close()
    })

    req.pipe(busboy)
  }
}

pipe.s3 = function pipes3(s3, opts) {
  opts.streamer = s3streamer(s3, opts)
  return pipe(opts)
}

// -- helpers --

// Set default options
function defaults(opts) {
  opts = opts || {}

  if (!opts.streamer) {
    throw new Error('No streamer found. Must pass a streamer to multipart-pipe')
  }

  opts.limit = opts.limit === undefined ? '128mb' : opts.limit;
  opts.limit = typeof opts.limit === 'string' ? parseBytes(opts.limit) : opts.limit;
  opts.allow = opts.allow instanceof RegExp ? opts.allow : new RegExp(opts.allow || '.*');

  if (!opts.filename || typeof opts.filename !== 'function') {
    opts.filename = function (filename, mime) { return filename; };
  }

  return opts
}

// An s3 streamer
function s3streamer(s3, opts) {
  var headers = (opts || {}).headers || { }

  return function (file, filename, mimetype, encoding, callback) {
    headers['Content-Type'] = mimetype
    var buf = Buffer(0)
    file.on('data', function (chunk) {
      buf = Buffer.concat([buf, chunk])
    })
    file.on('end', function () {
      s3.putBuffer(buf, filename, headers, function (err, s3resp) {
        if (err) {
          return callback(err)
        } else if (s3resp.statusCode < 200 || s3resp.statusCode > 299) {
          return callback(new Error('Error uploading to s3: ' + s3resp.statusCode), s3resp)
        }
        s3resp.resume() // This finalizes the stream response
        callback()
      })
    })
  }
}

// Refcount is a reference-counted callback wrapper
// It will only call back when count === 0 and close() has been called
// Unless .cancel(err) is called, which will call immediately and never again
function Refcount(cb) {
  this.count = 0
  this.closed = false
  this.canceled = false
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
Refcount.prototype.cancel = function (err, code) {
  if (!this.canceled) {
    this.canceled = true
    if (code && err) {
      err.code = err
    }
    this.cb(err)
  }
}
Refcount.prototype.maybecall = function () {
  if (!this.canceled && this.closed && this.count === 0) {
    this.cb()
  }
}