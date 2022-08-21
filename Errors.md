# Error handling

## Build errors

Build errors occur during buildtime (`backfr-builder`, `backfr-builder dev`) and will cause the builder to exit.

## Runtime errors

Runtime errors occur at the top level of scripts (eg. when pages are being imported). If a promise rejects then it will cause the runtime to exit. Unhandled rejections (top-level promises that arent `await`ed or aren't being caught) will act the same as a runtime error. Unhandled rejections are more difficult to catch.

## Render errors

Render errors occur during `getServerSideProps` and when rendering JSX components (`BackPage`). These errors will be forwarded to their appropiate _ERRORCODE or _error pages.

Errors created by/matching the "duck type" from [http-errors](https://www.npmjs.com/package/http-errors) are factored in when determining the error status code and the message being exposed.

If the error isn't exposed (404s, non `http-error`s (internal errors!)), it will be logged to stderr.