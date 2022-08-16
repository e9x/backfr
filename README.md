# back.js (backfr)

Serverside rendering on crack!

## Packages

- [backfr-builder](packages/builder/)
- [backfr](packages/runtime/)

## Objectives:

- Make a builder and runtime that are not dependant on eachother ("dependencies" field in package.json).
- Make a bundle that is capable of loading external node_modules, reducing bundle size.
- Strictly target server-side with APIs for convenience.

## CLI

### Start the development server:
```sh
$ backfr-builder dev
```

### Build for production:
```sh
$ backfr-builder build
```

### Start:
```sh
$ backfr
```