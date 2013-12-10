multipart-pipe
==============

Pipe multipart uploads direct to S3 or another file service in connect middleware _without writing to disk_. It uses [multiparty](https://github.com/superjoe30/node-multiparty) to parse the multipart form.

It is tested and soon to be used in production.

_Note_: If you are coming from the 0.2.2 or below version, the API has changed because `express.multipart` is deprecated and no nice multipart middleware exists to replace it, this package had to replicate some of that functionality. Now the only middleware you apply is the one in this package, and two new options (encoding and byte limits) are added to support functionality lost from express to multiparty.

## Install

```
npm install multipart-pipe
```

## Usage

```javascript
var multipartPipe = require('multipart-pipe'),
  knox = require('knox'),
  express = require('express')

var app = express(), /* or connect() */
  s3 = knox.createClient({
    bucket: my_bucket,
    key: my_key,
    secret: my_secret
  })

// Pipes to S3
app.use(multipartPipe.s3(s3))
```

## Results

In the request object after the pipe middleware will be two new fields on the request object:

- a new `req.files` field which will contain a map of filenames prior to upload to filenames on the streamed-to fileserver.
- a `req.form` field with a map of form field values that might have also come with the multipart file.

For example:

```javascript
app.use('/upload', multipartPipe.s3(s3))
app.post('/upload', function (req, res) {
  res.send({
    ok: true,
    uploaded_files: req.files,
    other_fields: req.form
  })
})
```

## Options

The main way to instantiate the middleware is `multipartPipe(options)` where options contains the following:

- `streamer` - Required `function (part, filename, callback)`
  - Optionally call `multipartPipe.s3(s3_knox_client, options)` to use built-in S3 streamer
- `allow` - Optional `String` or `RegExp` to test each part's content-type header for acceptability
- `filename` - Optional `function (part_filename, part_content_type)` which returns a filename to store. Defaults to `function (part_filename) { return part_filename; }`
- `encoding` - Set the encoding. Defaults to the usual `utf8`.
- `limit` - Set a bytesReceived limit. Can be in string form like `'128mb'`, `'1gb'`, `'512kb'`. Defaults to `128mb'.

### S3 Options

When using `pipe.s3(s3_knox_client, opts)`, there are additional options:

- `headers` - Optional object with default headers for each upload to S3. Defaults to enabling public-read.

## Useful Things To Know

- Limit upload size:

    ```javascript
    app.use(multipartPipe.s3(s3, { limit: '128mb' }))
    ```

- Limit content types (to say, just images):

    ```javascript
    app.use(multipartPipe.s3(s3, {
      allow: /^image\/.*$/
    }))
    ```

- Use uploaded filename with counter and a path parameter prepended:

    ```javascript
    var counter = 0;
    app.use(multipartPipe.s3(s3, {
      filename: function (fn, mime) {
        return req.params.prefix + '/' + (counter++) + '_' + fn
      }
    }))
    ```

- Create your own streamer function

    ```javascript
    function streamer(part, filename, callback) {
      // see source s3streamer() for example
    }

    app.use(multipartPipe({streamer: streamer}))
    ```

- Restrict the middleware to a specific path

    ```javascript
    app.use('/upload', multipartPipe.s3(s3, opts))
    ```

# License

MIT in LICENSE file.
