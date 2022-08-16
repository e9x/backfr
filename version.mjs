#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'fs/promises';

const packages = await readdir('packages');
const packageNames = [];

const version = process.argv[2];

for (const pkg of [
	'package.json',
	...packages.map((pk) => `packages/${pk}/package.json`),
]) {
	const data = JSON.parse(await readFile(pkg));
	data.version = version;
	packageNames.push(data.name);
	await writeFile(pkg, JSON.stringify(data, null, '\t') + '\n');
}

const lockfile = 'package-lock.json';

const data = JSON.parse(await readFile(lockfile));

for (const pkg of ['', ...packages.map((pkg) => `packages/${pkg}`)]) {
	data.packages[pkg].version = version;
}

data.version = version;

await writeFile(lockfile, JSON.stringify(data, null, '\t') + '\n');
