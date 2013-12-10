multipart-pipe
==============

Pipe multipart uploads direct to S3 or another file service in connect middleware _without writing to disk_.

It is tested and will be used in production.

## Install

```
npm install multipart-pipe
```

## Usage

```javascript
var pipe = require('multipart-pipe'),
  knox = require('knox'),
  express = require('express'),
  multiparty = require('multiparty')

var app = express(), /* or connect() */
  s3 = knox.createClient({
    bucket: my_bucket,
    key: my_key,
    secret: my_secret
  })

// This is very important
app.use(multiparty({ defer: true }))

// Pipes to S3
app.use(pipe.s3(s3))
```

## Results

In the request object after the pipe middleware will be a new `req.uploaded_files` field which will contain a map of filenames prior to upload to filenames on the streamed-to fileserver.

For example:

```javascript
app.use('/upload', pipe.s3(s3))
app.post('/upload', function (req, res) {
  res.send({
    ok: true,
    uploaded_files: req.uploaded_files
  })
})
```

## Options

The main way to instantiate the middleware is `pipe(options)` where options contains the following:

- `streamer` - Required `function (part, filename, callback)`
  - Optionally call `pipe.s3(s3_knox_client, options)` to use built-in S3 streamer
- `allow` - Optional `String` or `RegExp` to test each part's content-type header for acceptability
- `filename` - Optional `function (part_filename)` which returns a filename to store. Defaults to `uuid.v4() + path.extname(part_filename)`

### S3 Options

When using `pipe.s3(s3_knox_client, opts)`, there are additional options:

- `headers` - Optional object with default headers for each upload to S3. Defaults to enabling public-read.

## Useful Things To Know

- Limit upload size:

    ```javascript
    app.use(express.multipart({ defer: true, limit: '128mb' }))
    ```

- Limit content types (to say, just images):

    ```javascript
    app.use(pipe.s3(s3, {
      allow: /^image\/.*$/
    }))
    ```

- Use uploaded filename with counter and a path parameter prepended:

    ```javascript
    var counter = 0;
    app.use(pipe.s3(s3, {
      filename: function (fn, req) {
        return req.params.prefix + '/' + (counter++) + '_' + fn
      }
    }))
    ```

- Create your own streamer function

    ```javascript
    function streamer(part, filename, callback) {
      // see source s3streamer() for example
    }

    app.use(pipe({streamer: streamer}))
    ```

- Restrict the middleware to a specific path

    ```javascript
    app.use('/upload', express.multipart({defer: true}))
    app.use('/upload', pipe.s3(s3, opts))
    ```

# License

MIT in LICENSE file.
