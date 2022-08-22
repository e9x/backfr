# Project structure

A back.js project consists of

- tsconfig
- eslint config
- dotenv files
- src/pages/

A project is the folder that contains the above.

## Integration

### ESlint

Before every build, ESLint is ran on the entire project directory. This factors in .eslintrc and .eslintignore.

### TypeScript

TypeScript is used to compile JSX down to JavaScript that can be ran natively. Although only JSX needs to be compiled, this allows for TypeScript to be used. With this setup, you're able to write code only in JavaScript and it will be compiled according to the tsconfig.json (not transpiled!).

The following settings are required in order to compile:

- tsconfig.jsx = `react-jsx`
- tsconfig.module = `esnext`

Configuring package.json to use `"type": "module"` is not required because the .back folder is configured to be treated as an ESM project.

Top-level async and import of ESM modules is supported. Back.js is ESM.

### Dotenv

The [dotenv-flow](https://www.npmjs.com/package/dotenv-flow) and [dotenv-expand](https://www.npmjs.com/package/dotenv-expand) packages are used to load dependant environment variables. Currently, only development and production are the only project targets. Production is used when running the backfr cli, development is used when running the backfr builder in dev mode.