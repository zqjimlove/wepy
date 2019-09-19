import compile from '../compile';

import cacache from 'cacache';
import { cacheDir, defaultCacheKeys } from '../cache';

exports = module.exports = program => {
    function doCompile() {
        if (compile.init(program)) {
            compile.build(program);
        }
		}
		
    if (!program.cache) {
        cacache.rm.all(cacheDir).then(doCompile);
    } else {
        doCompile();
    }
};
