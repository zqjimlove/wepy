/**
 * Tencent is pleased to support the open source community by making WePY available.
 * Copyright (C) 2017 THL A29 Limited, a Tencent company. All rights reserved.
 *
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
 * http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

import util from './util';
import findCacheDir from 'find-cache-dir';
import os from 'os';
import serialize from 'serialize-javascript';
import crypto from 'crypto';
import cluster from 'cluster';

const cachePath = '.wepycache';
let _buildCache = null;
let _cacheChanged = false;
let _filelistCache = {};
let _cssDeps = {};
let _cache = {};
let _appedBuildCache = {}

let cacheVersion = 0;

export default {
    setAppOpath(opath) {
        _cache.appOpath = opath;
    },
    getAppOpath() {
        return _cache.appOpath;
    },
    setParams(v) {
        _cache._params = v;
    },
    getParams() {
        return _cache._params;
    },
    setExt(v) {
        _cache._ext = v;
    },
    getExt() {
        return _cache._ext || '.wpy';
    },
    getSrc() {
        return _cache._src || 'src';
    },
    setSrc(v = 'src') {
        _cache._src = v;
    },
    getDist() {
        return _cache._dist || 'dist';
    },
    setDist(v = 'dist') {
        _cache._dist = v;
    },
    setPages(v = []) {
        _cache._pages = v;
    },
    getPages() {
        return _cache._pages || [];
    },
    getConfig() {
        return _cache._config || null;
    },
    setConfig(v = null) {
        _cache._config = v;
        defaultCacheKeys.configHash = crypto
            .createHash('md4')
            .update(serialize(v))
            .digest('hex');
    },
    setFileList(key, v) {
        _filelistCache[key] = v;
    },
    getFileList(key) {
        return _filelistCache[key] || null;
    },
    getBuildCache(file) {
        if (_buildCache) return _buildCache;

        if (util.isFile(cachePath)) {
            _buildCache = util.readFile(cachePath);
            try {
                _buildCache = JSON.parse(_buildCache);
            } catch (e) {
                _buildCache = null;
            }
        }

        return _buildCache || {};
    },
    setBuildCache(file) {
        let cache = this.getBuildCache();
        _appedBuildCache[file] = cache[file] = util.getModifiedTime(file);
        _buildCache = cache;
        _cacheChanged = true;
        return ++cacheVersion;
    },
    appendBuildCache(_cache){
        let cache = {
            ...this.getBuildCache(),
            ..._cache
        };
        _buildCache = cache;
        _cacheChanged = true;
        return ++cacheVersion;
    },
    getAppendBuildCache(){
        return _appedBuildCache;
    },
    clearAppendBuildCache(){
        _appedBuildCache = {}
    },
    clearBuildCacheInMemory(){
        _buildCache = null;
    },
    clearBuildCache() {
        util.unlink(cachePath);
    },
    saveBuildCache() {
        if (_cacheChanged) {
            if(cluster.isMaster){
                util.writeFile(cachePath, JSON.stringify(_buildCache));
            }
            _cacheChanged = false;
        }
    },
    checkBuildCache(file) {
        let cache = this.getBuildCache();
        return cache[file] && cache[file] === util.getModifiedTime(file);
    },
    addCssDep(file, context) {
        if (!_cssDeps[file]) {
            _cssDeps[file] = [];
        }
        if (_cssDeps[file].indexOf(context) === -1) {
            _cssDeps[file].push(context);
        }
    },
    getCssDep(file) {
        return _cssDeps[file] || [];
    },
    getCache() {
        return _cache;
    },
    setCache(cache) {
        _cache = cache;
    }
};

export let defaultCacheKeys = {
    wepyVersion: '1.7.x',
    company: 'gd',
    NODE_ENV: process.env.NODE_ENV
};

export const cacheDir = findCacheDir({ name: 'wepy' }) || os.tmpdir();