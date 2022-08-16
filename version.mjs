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

for (const pkg of packages.map((pk) => `packages/${pk}/package.json`)) {
	const data = JSON.parse(await readFile(pkg));

	if (!data.dependencies) continue;

	for (const pn of packageNames) {
		if (pn in data.dependencies) {
			data.dependencies[pn] = '^' + version;
		}
	}

	await writeFile(pkg, JSON.stringify(data, null, '\t') + '\n');
}

const lockfile = 'package-lock.json';

const data = JSON.parse(await readFile(lockfile));

for (const pkg of ['', ...packages.map((pkg) => `packages/${pkg}`)]) {
	const entry = data.packages[pkg];

	entry.version = version;

	if (!entry.requires) continue;

	for (const pn of packageNames) {
		if (pn in entry.dependencies) {
			entry.requires[pn] = '^' + version;
		}
	}
}

data.version = version;

await writeFile(lockfile, JSON.stringify(data, null, '\t') + '\n');
