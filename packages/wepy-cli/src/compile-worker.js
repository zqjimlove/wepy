import cache, { defaultCacheKeys, cacheDir } from './cache';
import util from './util';

export default function(compiler) {
    let isInitChildProcess = false;
    let _config;
    let QUEUE_DRAIN = false;
    let killTimeer;
    let workerCacheVersion = -1;

    const MessageHandler = {
        INIT_REQUEST({ config, pages, appOpath }) {
            _config = config;
            if (!isInitChildProcess) {
                isInitChildProcess = true;
                compiler.workerInit(config);
                cache.setPages(pages);
                cache.setAppOpath(appOpath);
            }
        },
        COMPILER_REQUEST({ data, cacheVersion }) {
            try {
                if (workerCacheVersion !== cacheVersion) {
                    cache.clearBuildCacheInMemory();
                }
                compiler._compile(data.opath, _config);
            } catch (err) {
                process.send({ name: 'ERROR', err });
            }
        },

        END() {
            killTimeer = setTimeout(() => {
                process.exit(0);
            }, 20000);
        },
        KILL() {
            process.exit(0);
        }
    };

    process.on('message', msg => {
        // console.log(`${name},msg:${JSON.stringify(appOpath)}`);
        // data && console.log(`message#${name}#${JSON.stringify(data.opath||{})}#`+process.pid);
        clearTimeout(killTimeer);
        MessageHandler[msg.name](msg);
    });

    util.compileEmitter.on('allCompileEnd', () => {
        let tempCache = cache.getAppendBuildCache();
        cache.clearAppendBuildCache();
        process.send({
            name: 'COMPILED',
            buildCache: tempCache
        });
        clearTimeout(killTimeer);
        killTimeer = setTimeout(() => {
            process.send({ name: 'KILL_REQUEST' });
        }, 1000);
    });

    // util.compileEmitter.on('startCompile', () => {
    //     clearTimeout(killTimeer);
    // });
}
