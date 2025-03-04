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

import cache,{cacheDir as _cacheDir, defaultCacheKeys} from './cache'
import cWpy from './compile-wpy';
import serialize from 'serialize-javascript';
import crypto from 'crypto'

import loader from './loader';

import resolve from './resolve';

import cacache from 'cacache';




const currentPath = util.currentDir;

let appPath, npmPath, src, dist;

export default {
    resolveDeps (code, type, opath) {
        let params = cache.getParams();
        let config = cache.getConfig();
        let wpyExt = params.wpyExt;

        let deps = [];
        code = code.replace(/(^|[^\.\w])require\(['"]([\w\d_\-\.\/@]+)['"]\)/ig, (match, char, lib) => {
            
            let npmInfo = opath.npm;

            if (lib === './_wepylogs.js') {
                return match;
            }
            let resolved = lib;

            let target = '', source = '', ext = '', needCopy = false;

            if (config.output === 'ant' && lib === 'wepy') {
                lib = 'wepy-ant';
            }else if (config.output === 'baidu' && lib === 'wepy') {
                lib = 'wepy-baidu';
            }
            lib = resolve.resolveAlias(lib, opath);
            
            if (lib === 'false') {
                return `${char}{}`;
            } else if (path.isAbsolute(lib)) {
                source = lib;
                target = util.getDistPath(source);
            } else if (lib[0] === '.') { // require('./something'');
                let resolvedLib;
                if (npmInfo && npmInfo.pkg._activeFields.length) {
                    resolvedLib = resolve.resolveSelfFields(npmInfo.dir, npmInfo.pkg, path.join(path.relative(npmInfo.dir, opath.dir), lib));
                }
                if (resolvedLib) {
                    source = path.join(npmInfo.dir, resolvedLib);
                    lib = path.relative(opath.dir, source);
                    if (lib[0] !== '.') {
                        lib = './' + lib;
                    }
                } else {
                    source = path.join(opath.dir, lib);
                }
                if (type === 'npm') {
                    target = path.join(npmPath, path.relative(npmInfo.modulePath, source));
                    needCopy = true;
                } else {
                    // e:/dist/util
                    target = util.getDistPath(source);
                    needCopy = false;
                }
            } else if (lib.indexOf('/') === -1 || // require('asset');
                lib.indexOf('/') === lib.length - 1 || // reqiore('a/b/something/')
                (lib[0] === '@' && lib.indexOf('/') !== -1 && lib.lastIndexOf('/') === lib.indexOf('/')) // require('@abc/something')
            ) {
                // require('stream') -> browsers: emitter->emitter-component;
                if (npmInfo && npmInfo.pkg._activeFields.length) {
                    let resolvedLib = resolve.resolveSelfFields(npmInfo.dir, npmInfo.pkg, lib);
                    lib = resolvedLib ? resolvedLib : lib;
                }
                let mainFile = resolve.getMainFile(lib);

                if (!mainFile) {
                    throw Error('找不到模块: ' + lib + '\n被依赖于: ' + path.join(opath.dir, opath.base) + '。\n请尝试手动执行 npm install ' + lib + ' 进行安装。');
                }
                npmInfo = {
                    lib: lib,
                    dir: mainFile.dir,
                    modulePath: mainFile.modulePath,
                    file: mainFile.file,
                    pkg: mainFile.pkg
                };

                let resolvedFile;
                if (mainFile.pkg && mainFile.pkg._activeFields.length) {
                    resolvedFile = resolve.resolveSelfFields(mainFile.dir, mainFile.pkg, mainFile.file);
                }
                resolvedFile = resolvedFile ? resolvedFile : mainFile.file;
                source = path.join(mainFile.dir, resolvedFile);
                target = path.join(npmPath, lib, resolvedFile);

                lib += path.sep + resolvedFile;
                ext = '';
                needCopy = true;
            } else { // require('babel-runtime/regenerator')
                let isPrivateModule = lib[0] === '@'
                let requireInfo = lib.split('/');
                let _lib = isPrivateModule
                ? requireInfo.slice(0, 2).join('/')
                : requireInfo[0]

                let mainFile = resolve.getMainFile(_lib);
                if (!mainFile) {
                    throw Error('找不到模块: ' + lib + '\n被依赖于: ' + path.join(opath.dir, opath.base) + '。\n请尝试手动执行 npm install ' + lib + ' 进行安装。');
                }
                npmInfo = {
                    lib: _lib,
                    dir: mainFile.dir,
                    modulePath: mainFile.modulePath,
                    file: mainFile.file,
                    pkg: mainFile.pkg
                };
                requireInfo.shift();
                
                let resolvedFile = requireInfo.slice(isPrivateModule?1:0).join('/')
                if (mainFile.pkg && mainFile.pkg._activeFields.length) {
                    resolvedFile = resolve.resolveSelfFields(mainFile.dir, mainFile.pkg, resolvedFile) || resolvedFile;
                    if (path.extname(resolvedFile) === '.wpy') {
                        resolvedFile = resolvedFile.substr(0, resolvedFile.length - 4);
                    }
                }

                source = path.join(mainFile.dir, resolvedFile);
                target = path.join(npmPath, npmInfo.lib, resolvedFile);
                ext = '';
                needCopy = true;
                // It's a node_module component.
                if (path.extname(mainFile.file) === '.wpy') {
                    source += '.wpy';
                }
            }

            if (util.isFile(source + wpyExt)) {
                ext = '.wpy';
            } else if (util.isFile(source + '.js')) {
                ext = '.js';
            } else if (util.isFile(source + '.ts')) {
                ext = '.ts';
            } else if (util.isDir(source) && util.isFile(source + path.sep + 'index.js')) {
                ext = path.sep + 'index.js';
            }else if (util.isFile(source)) {
                ext = '';
            } else {
                throw `Missing files: ${resolved} in ${path.join(opath.dir, opath.base)}`;
            }
            source += ext;
            target += ext;
            lib += ext;
            resolved = lib;

            //typescript .ts file
            if (ext === '.ts') {
                target = target.replace(/\.ts$/, '') + '.js';
            }

            // 第三方组件
            if (/\.wpy$/.test(resolved)) {
                target = target.replace(/\.wpy$/, '') + '.js';
                resolved = resolved.replace(/\.wpy$/, '') + '.js';
                lib = resolved;
            }

            if (needCopy) {
                if (!cache.checkBuildCache(source)) {
                    cache.setBuildCache(source);
                    util.log('依赖: ' + path.relative(process.cwd(), target), '拷贝');
                    let newOpath = path.parse(source);
                    newOpath.npm = npmInfo;
                    this.compile('js', null, 'npm', newOpath);
                    deps.push(newOpath);
                }
            }
            if (type === 'npm') {
                if (lib[0] !== '.') {
                    resolved = path.join('..' + path.sep, path.relative(opath.dir, npmInfo.modulePath), lib);
                } else {
                    if (lib[0] === '.' && lib[1] === '.')
                        resolved = './' + resolved;
                }

            } else {
                resolved = path.relative(util.getDistPath(opath, opath.ext, src, dist), target);
            }
            resolved = resolved.replace(/\\/g, '/').replace(/^\.\.\//, './');
            return `${char}require('${resolved}')`;
        });

        return [code,deps];
    },

    npmHack (opath, code) {
        // 一些库（redux等） 可能会依赖 process.env.NODE_ENV 进行逻辑判断
        // 这里在编译这一步直接做替换 否则报错
        code = code.replace(/process\.env\.NODE_ENV/g, JSON.stringify(process.env.NODE_ENV));
        switch(opath.base) {
            case 'lodash.js':
            case '_global.js':
                code = code.replace('Function(\'return this\')()', 'this');
                break;
            case '_html.js':
                code = 'module.exports = false;';
                break;
            case '_microtask.js':
                code = code.replace('if(Observer)', 'if(false && Observer)');
                // IOS 1.10.2 Promise BUG
                code = code.replace('Promise && Promise.resolve', 'false && Promise && Promise.resolve');
                break;
            case '_freeGlobal.js':
                code = code.replace('module.exports = freeGlobal;', 'module.exports = freeGlobal || this;')
        }
        let config = util.getConfig();
        if (config.output === 'ant' && opath.dir.substr(-19) === 'wepy-async-function') {
            code = '';
        }
        return code;
    },

    compile (lang, code, type, opath, opts = {}) {
        let _timeLogs = util.getTimerLog();

        util.startCompile();
        let config = util.getConfig();
        src = cache.getSrc();
        dist = cache.getDist();
        npmPath = path.join(currentPath, dist, 'npm' + path.sep);

        if (!code) {
            code = util.readFile(path.join(opath.dir, opath.base));
            if (code === null) {
                throw '打开文件失败: ' + path.join(opath.dir, opath.base);
            }
        }

        let compiler = loader.loadCompiler(lang);

        if (!compiler) {
            throw '找不到编译器：wepy-compiler-'+lang
        }

        // replace wx to swan
        if(config.output === 'baidu') {
            code = code.replace(/\b(wx)\b/g, function(match, p1, offset, s) {
                // ignore like -wx- syntactic
                if(s.charAt(offset - 1) === '-' || s.charAt(offset + 2 )=== '-') {
                    return p1;
                } else {
                    return 'swan';
                }
            })
        }

        let target;
        if (type !== 'npm') {
            target = util.getDistPath(opath, 'js');
        } else {
            code = this.npmHack(opath, code);
            const base =
                opath.ext === '.wpy'
                    ? opath.base.replace(opath.ext, '.js')
                    : opath.base;
            target = path.join(
                npmPath,
                path.relative(opath.npm.modulePath, path.join(opath.dir, base))
            );
        }

        let {
            cacheDir = _cacheDir,
            cacheKeys = {
                ...defaultCacheKeys,
                output: config.output,
                filePath: target
            }
        } = opts;
        
        let _cacheKey = serialize({
            ...cacheKeys,
            filePath: target,
            hash: crypto
                .createHash('md4')
                .update(code)
                .digest('hex')
        });

        _timeLogs.push(`预处理`);

        function enqueue() {
            
            let compilerConfig = config.compilers[lang];
            if (lang === 'babel') {
                compilerConfig = Object.assign({}, compilerConfig, {
                    filename: path.join(opath.dir, opath.base)
                });
            }

            compiler(code, compilerConfig).then(compileResult => {
                _timeLogs.push(`Babel处理`);

                let sourceMap;
                if (typeof(compileResult) === 'string') {
                    code = compileResult;
                } else {
                    sourceMap = compileResult.map;
                    code = compileResult.code;
                }
                if (type !== 'npm') {
                    if (type === 'page' || type === 'app') {
                        code = code.replace(/exports\.default\s*=\s*(\w+);/ig, function (m, defaultExport) {
                            if (defaultExport === 'undefined') {
                                return '';
                            }
                            if (type === 'page') {
                                if(!appPath){
                                    appPath = cache.getAppOpath();
                                }
                                let pagePath = path.join(path.relative(appPath.dir, opath.dir), opath.name).replace(/\\/ig, '/');
                                return `\nPage(require('wepy').default.$createPage(${defaultExport} , '${pagePath}'));\n`;
                            } else {
                                appPath = opath;
                                let appConfig = JSON.stringify(config.appConfig || {});
                                let appCode = `\nApp(require('wepy').default.$createApp(${defaultExport}, ${appConfig}));\n`;
                                if (config.cliLogs) {
                                    appCode += 'require(\'./_wepylogs.js\')\n';
                                }
                                return appCode;
                            }
                        });
                    }
                }
                
                let deps;
                [code, deps] = this.resolveDeps(code, type, opath);

                if (!opath.compiled && type === 'npm' && opath.ext === '.wpy') { // 第三方npm组件，后缀恒为wpy
                    opath.compiled = true
                    cWpy.compile(opath);
                    util.endCompile();
                    return;
                }
    
                
    
                if (sourceMap) {
                    sourceMap.sources = [opath.name + '.js'];
                    sourceMap.file = opath.name + '.js';
                    var Base64 = require('js-base64').Base64;
                    code += `\r\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Base64.encode(JSON.stringify(sourceMap))}`;
                }
                
                _timeLogs.push(`Babel后处理`);
                let plg = new loader.PluginHelper(config.plugins, {
                    type: type,
                    code: code,
                    file: target,
                    output (p) {
                        util.output(p.action, p.file);
                    },
                    done (result) {
                        // util.output('写入', `${_cacheKey}:${result.file}`);
                        // util.writeFile(target, result.code);
                        _timeLogs.push(`插件处理`);
                        result.target = target;
                        result.deps = deps;
                        if (cacheDir && opts.cache) {
                            cacache
                                .put(
                                    cacheDir,
                                    _cacheKey,
                                    JSON.stringify(result)
                                )
                                .then(() => {
                                    wirte(result);
                                });
                        } else {
                            wirte(result);
                        }
                    }
                });
                // 缓存文件修改时间戳
                cache.saveBuildCache();
            }).catch((e) => {
                console.error(e);
                util.error(e);
                util.endCompile();
            });
        }

        function wirte({ target, code, file }, isCache = false){
            _timeLogs.gt(1000).print(`编译耗时过大：${file}`);
            util.output((isCache?'缓存':'')+'写入', file);
            util.writeFile(target, code);
            util.endCompile();
        }

        if (cacheDir && opts.cache) {
            cacache.get(cacheDir, _cacheKey).then(({ data }) => {
                let result = JSON.parse(data);
                let deps = result.deps;
                deps.forEach(opath=>{
                    this.compile('js', null, 'npm', opath);
                })
                wirte(result, true);
            }, enqueue.bind(this));
        } else {
            enqueue.call(this);
        }
    }

}
