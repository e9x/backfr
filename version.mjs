#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'fs/promises';

const packages = await readdir('packages');
const packageNames = [];

const version = process.argv[2];

for (const pkg of packages.map((pk) => `packages/${pk}/package.json`)) {
	const data = JSON.parse(await readFile(pkg));

	data.version = version;
	packageNames.push(data.name);

	for (const x of ['dependencies', 'devDependencies'])
		if (data[x]) {
			for (const pn of packageNames) {
				if (pn in data[x]) {
					data[x][pn] = version;
				}
			}
		}

	await writeFile(pkg, JSON.stringify(data, null, '\t') + '\n');
}

for (const pkg of packages.map((pk) => `packages/${pk}/package.json`)) {
	const data = JSON.parse(await readFile(pkg));

	for (const depType of ['dependencies', 'devDependencies'])
		if (data[depType]) {
			const deps = data[depType];

			for (const pn of packageNames) {
				if (pn in deps) {
					const [, sym] = deps[pn].match(/^(>=|<=|[<>~^])/) || [];
					deps[pn] = (sym || '') + version;
				}
			}
		}

	await writeFile(pkg, JSON.stringify(data, null, '\t') + '\n');
}
