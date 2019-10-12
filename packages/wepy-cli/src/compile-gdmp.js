/**
 * Tencent is pleased to support the open source community by making WePY available.
 * Copyright (C) 2017 THL A29 Limited, a Tencent company. All rights reserved.
 *
 * Licensed under the MIT License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
 * http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

import path from 'path'
import fs from 'fs'
import eslint from './eslint'
import cache from './cache'
import util from './util'

import cConfig from './compile-config'
/*import cLess from './compile-less';
import cSass from './compile-sass';
import cCss from './compile-css';*/
import cStyle from './compile-style'
import cTemplate from './compile-template'
import cScript from './compile-script'
import resolve from './resolve'

import cWpy from './compile-wpy'

export default {
    remove(opath, ext) {
        let src = cache.getSrc()
        let dist = cache.getDist()
        ext = ext || opath.substr(1)
        let target = util.getDistPath(opath, ext, src, dist)
        if (util.isFile(target)) {
            fs.unlinkSync(target)
        }
    },
    resolveGdmp(xml, opath) {
        let config = util.getConfig()
        let filepath

        if (typeof xml === 'object' && xml.dir) {
            opath = xml
            filepath = path.join(xml.dir, xml.base)
        } else {
            opath = path.parse(xml)
            filepath = xml
        }
        filepath = path.resolve(filepath) // to fixed windows path bug
        let content = util.readFile(filepath)

        const moduleId = util.genId(filepath)

        let rst = {
            moduleId: moduleId,
            style: [],
            template: {
                code: '',
                src: '',
                type: ''
            },
            script: {
                code: '',
                src: '',
                type: ''
            },
            config: {
                code: ''
            }
        }

        if (content === null) {
            util.error('打开文件失败: ' + filepath)
            return rst
        }
        if (content === '') {
            util.warning('发现空文件: ' + filepath)
            return rst
        }

        if (content.indexOf('<template') !== -1) {
            content = util.attrReplace(content, true)
        }

        xml = cWpy.createParser().parseFromString(content)

        Array.prototype.slice.call(xml.childNodes || []).forEach(child => {
            const nodeName = child.nodeName
            if (~['style', 'template', 'script'].indexOf(nodeName)) {
                let rstTypeObj

                if (nodeName === 'style') {
                    rstTypeObj = { code: '' }
                    rst[nodeName].push(rstTypeObj)
                } else if (
                    nodeName === 'script' &&
                    child.getAttribute('type') === 'config'
                ) {
                    rstTypeObj = rst['config']
                } else {
                    rstTypeObj = rst[nodeName]
                }

                rstTypeObj.src = child.getAttribute('src')
                rstTypeObj.type =
                    child.getAttribute('lang') || child.getAttribute('type')
                if (nodeName === 'style') {
                    // 针对于 style 增加是否包含 scoped 属性
                    rstTypeObj.scoped = child.getAttribute('scoped')
                        ? true
                        : false
                }

                if (rstTypeObj.src) {
                    // rstTypeObj.src = path.resolve(opath.dir, rstTypeObj.src);
                    rstTypeObj.src = path.resolve(
                        opath.dir,
                        resolve.resolveAlias(rstTypeObj.src, opath)
                    )
                    rstTypeObj.link = true
                } else {
                    rstTypeObj.link = false
                }

                if (rstTypeObj.src && util.isFile(rstTypeObj.src)) {
                    const fileCode = util.readFile(rstTypeObj.src, 'utf-8')
                    if (fileCode === null) {
                        throw '打开文件失败: ' + rstTypeObj.src
                    } else {
                        rstTypeObj.code += fileCode
                    }
                } else {
                    ;[].slice.call(child.childNodes || []).forEach(c => {
                        rstTypeObj.code += util.decode(c.toString())
                    })
                }

                if (!rstTypeObj.src)
                    rstTypeObj.src = path.join(
                        opath.dir,
                        opath.name + opath.ext
                    )
            }
        })

        return rst
    },
    compile(opath, opts) {
        opts = { ...opts, isGdmp: true }
        try {
            util.startCompile()
            let filepath = path.join(opath.dir, opath.base)
            let src = cache.getSrc()
            let dist = cache.getDist()

            let rst = this.resolveGdmp(opath)

            if (!rst) {
                util.endCompile()
                return
            }

            // default type
            rst.template.type = rst.template.type || 'wxml'
            rst.template.components = {} // 不使用wepy的组件功能
            rst.script.type = rst.script.type || 'babel'

            // 处理 scripts
            if (rst.script.code) {
                cScript.compile(
                    rst.script.type,
                    rst.script.code,
                    'page',
                    opath,
                    opts
                )
            }

            // 处理config
            let mpConfig = rst.config.code.replace(
                /[\s\r\n]export\s*default[\s\r\n]*/i,
                'return'
            )
            ;(() => {
                try {
                    rst.config.code = new Function(`${mpConfig}`)()
                } catch (err) {
                    console.error(err)
                    util.output('错误', path.join(opath.dir, opath.base))
                    util.error(
                        `解析config出错，报错信息：${err}\r\n${mpConfig}`
                    )
                }
            })()

            if (rst.config.code) {
                cConfig.compile(rst.config.code, opath, opts)
            } else {
                this.remove(opath, 'json')
            }

            //处理样式
            if (rst.style.length) {
                let requires = []
                try {
                    cStyle.compile(
                        rst.style,
                        requires,
                        opath,
                        rst.moduleId,
                        opts
                    )
                } catch (e) {
                    util.error(e)
                }
            } else {
                this.remove(opath, 'wxss')
            }

            //处理模板
            if (rst.style.length) {
                let requires = []
                try {
                    cStyle.compile(
                        rst.style,
                        requires,
                        opath,
                        rst.moduleId,
                        opts
                    )
                } catch (e) {
                    util.error(e)
                }
            } else {
                this.remove(opath, 'wxss')
            }

            if (rst.template && rst.template.code) {
                // App 和 Component 不编译 wxml
                //cTemplate.compile(wpy.template.type, wpy.template.code, opath);
                rst.template.npm = opath.npm
                cTemplate.compile(rst.template, opts)
            }

            util.endCompile()
        } catch (err) {
            console.error(err)
        }
    }
}
