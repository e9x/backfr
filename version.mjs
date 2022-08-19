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

	for (const x of ['dependencies', 'devDependencies'])
		if (data[x]) {
			for (const pn of packageNames) {
				if (pn in data[x]) {
					data[x][pn] = '^' + version;
				}
			}
		}

	await writeFile(pkg, JSON.stringify(data, null, '\t') + '\n');
}

console.log('Run npm install to update lockfile:');
console.log('$ npm install');
