/**
 *
 * @param {string} src
 * @returns {Promise<NodeJS.Module>}
 */
function freeImport(src) {
	return import(src);
}

module.exports = freeImport;
