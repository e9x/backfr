import type { BinaryLike, BinaryToTextEncoding} from 'crypto';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export const fileChecksum = (
	file: string,
	algorithm: string,
	digest: BinaryToTextEncoding
) =>
	new Promise<string>((resolve, reject) => {
		const hash = createHash(algorithm);
		const read = createReadStream(file);
		read.on('end', () => resolve(hash.digest(digest)));
		read.on('error', reject);
		read.pipe(hash);
	});

export const dataChecksum = (
	data: BinaryLike,
	algorithm: string,
	digest: BinaryToTextEncoding
) => {
	const hash = createHash(algorithm);
	hash.update(data);
	return hash.digest(digest);
};
