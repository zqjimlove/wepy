/**
 * Tencent is pleased to support the open source community by making WePY available.
 * Copyright (C) 2017 THL A29 Limited, a Tencent company. All rights reserved.
 *
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
 * http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

import path from 'path';

import util from './util';
import cache from './cache';
import loader from './loader';

import serialize from 'serialize-javascript';
import cacache from 'cacache';
import crypto from 'crypto'

export default {
    compile(config, opath, opts = {}) {
        let src = cache.getSrc();
        let dist = cache.getDist();
        let wepyrc = cache.getConfig();

        let target = util.getDistPath(opath, 'json', src, dist);

        let { cacheDir,cacheKeys } = opts;

        let _cacheKey = serialize({
            ...cacheKeys,
            filePath: target,
            hash: crypto
                .createHash('md4')
                .update(JSON.stringify(config))
                .digest('hex')
        });

        if (
            wepyrc.output === 'ant' &&
            config.navigationBarTitleText &&
            !config.defaultTitle
        ) {
            config.defaultTitle = config.navigationBarTitleText;
        }
       

        function enqueue() {
            let plg = new loader.PluginHelper(wepyrc.plugins, {
                type: 'config',
                code: JSON.stringify(config),
                file: target,
                output(p) {
                    util.output(p.action, p.file);
                },
                done(result) {
                    // util.output('写入', result.file);
                    // util.writeFile(target, result.code);
                    result.target = target;
                    if (opts.cache) {
                        cacache
                            .put(cacheDir, _cacheKey, JSON.stringify(result))
                            .then(() => {
                                wirte(result);
                            });
                    } else {
                        wirte(result);
                    }
                   
                }
            });
        }

        function wirte({ target, code, file },isCache = false){
            util.output((isCache ? '缓存' : '') + '写入', file);
            util.writeFile(target, code);
        }

        if (opts.cache) {
            cacache.get(cacheDir, _cacheKey).then(({ data }) => {
                let result = JSON.parse(data);
                wirte(result, true);
            }, enqueue);
        } else {
            enqueue.call(this);
        }
       
    }
};
