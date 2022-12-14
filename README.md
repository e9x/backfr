# back.js (backfr)

Back from compiling all your server + client code, serving 100 KB bundles, and using overkill frameworks for small tasks.

## Archived

This project is unmaintained and is likely going to be redundant once Next.JS figures out how to strip outputted HTML of JS.

## Examples

Example repo can be found [here](https://github.com/e9x/backfr-example).

## Packages

- [backfr-builder](packages/builder/)
- [backfr](packages/runtime/)

## Objectives:

- Make a builder and runtime that are not dependant on eachother ("dependencies" field in package.json).
- Produce bundles that will leverage native module resolutions to reduce bundle size.
- Strictly target server-side with APIs for convenience.

## CLI

### Start the development server:
```sh
$ backfr-builder dev
```

### Build for production:
```sh
$ backfr-builder
```

### Start:
```sh
$ backfr
```

## Project structure

See [Structure.md](./Structure.md)

## Error handling

See [Errors.md](./Errors.md)
