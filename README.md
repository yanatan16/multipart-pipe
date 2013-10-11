multipart-pipe
==============

Pipe multipart uploads direct to S3 or another file service in connect middleware.

It is tested and will be used in production.

## Install

```
npm install multipart-pipe
```

## Usage

```javascript
var pipe = require('multipart-pipe'),
  app = express(), /* or connect() */
  s3_options = {
    bucket: my_bucket,
    key: my_key,
    secret: my_secret,
    headers: { 'x-amz-acl': 'public-read' }
  }

// This is very important
app.use(express.multipart({ defer: true }))

// Pipes to S3
app.use(pipe.s3(s3_knox_options))
```

## Options

The main way to instantiate the middleware is `pipe(options)` where options contains the following:

- `streamer` - Required `function (part, filename, callback)`
  - Optionally call `pipe.s3(s3options, options)` to use built-in S3 streamer
- `content-type` - Optional `String` or `RegExp` to test each part's content-type header for acceptability
- `filename` - Optional `function (part_filename)` which returns a filename to store. Defaults to `uuid.v4() + path.extname(part_filename)`

### S3 Options

The S3 options passed to `pipe.s3(s3opts, opts)` should look like normal `knox.createClient(options)` ([docs](https://github.com/LearnBoost/knox)) with the addition of:

- `headers` - Optional object with default headers for each upload to S3. Defaults to enabling public-read.

# License

MIT in LICENSE file.
