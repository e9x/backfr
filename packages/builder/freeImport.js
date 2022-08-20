'use strict';

/**
 *
 * @param {string} src
 * @returns {Promise<any>}
 */
function freeImport(src) {
	return import(src);
}

module.exports = freeImport;
