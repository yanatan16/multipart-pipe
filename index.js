// multipart-pipe/index.js
// Pipe multipart uploads to a file server without touching disk!

// builtin
var path = require('path')

// vendor
var multiparty = require('multiparty'),
  parseBytes = require('bytes');

module.exports = pipe


function pipe(options) {
  options = defaults(options)

  var typetest = options.allow,
    fngen = options.filename,
    limit = opts.limit,
    encoding = opts.encoding,
    streamer = options.streamer

  return function (req, res, next) {
    req.form = {};
    req.files = {};
    var form = new multiparty.Form({encoding: encoding}),
      refnext = new Refcount(next);

    form.on('field', function (name, value) {
      req.form[name] = value;
    });

    .on('part', function (part) {
      if (!part.filename) return; // Not a file
      if (!typetest.test(part.headers['content-type'])) return; // not allowed by user
      if (opts.limit && (form.bytesReceived > limit || form.bytesExpected > limit)) {
        req.abort();
        return refnext.cancel(new Error('Byte Limit exceeded'), 413)
      }

      var filename = fngen(part.filename, part.headers['content-type']);
      refnext.incr();

      streamer(part, filename, function (err) {
        if (err) {
          return refnext.cancel(err, 500);
        }

        req.files[part.filename] = filename;
        refnext.decr();
      });
    })

    .on('close', function () {
      refnext.close();
    })

    .on('error', function (err) {
      refnext.cancel(err, 400);
    })

    .parse(req);
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

  opts.encoding = opts.encoding || 'utf8';
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
  var headers = (opts || {}).headers || { 'x-amz-acl': 'public-read' }

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