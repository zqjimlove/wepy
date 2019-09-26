## WePY

具体介绍点击链接查看 --> https://wepyjs.github.io/wepy-docs/1.x/#/

### wepy-cli-next

相比wepy-cli增加/优化以下功能：

* 多进程编译
* 编译缓存 ，关闭编译缓存 --no-cache
* -c,--clear 清空 dist 目录命令，此时不使用任何缓存
* babel7支持

* 优化日志输出

## babel7 支持

wepy.config.js 增加 `useBabel7: Boolean` 选项

> 使用 babel7 需要修改 babel 配置。并安装新的插件。

### 配置

wepy.config.js

```javascript
module.exports = {
    //...
    useBabel7: true,
    compilers:{
        babel:{
            passPerPreset: true,
            presets: [
                [
                '@babel/preset-env',
                {
                    targets: {
                        browsers: ['last 2 versions', '> 2%', 'not ie <= 11']
                    }
                }
                ]
            ],
            plugins: [
                ['@babel/plugin-proposal-decorators', { 'legacy': true }],
                ['@babel/plugin-proposal-class-properties', { 'loose': true }],
                '@babel/plugin-proposal-export-default-from',
                '@babel/plugin-proposal-export-namespace-from',
                '@babel/plugin-syntax-export-extensions',
                '@babel/plugin-transform-runtime'
            ]
        }
    }
    //...
}
```