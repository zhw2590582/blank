let hover = false;
let duration = 0;
const $log = document.querySelector('.log');
const $generate = document.querySelector('.generate');
const $hour = document.querySelector('.hour');
const $minute = document.querySelector('.minute');
const $second = document.querySelector('.second');
const $resolution = document.querySelector('.resolution');
const $poster = document.querySelector('.poster');

function log(data) {
    const count = $log.childElementCount;
    if (count >= 200) $log.removeChild($log.firstElementChild);
    if (data.replace) $log.removeChild($log.lastElementChild);

    $log.insertAdjacentHTML(
        'beforeend',
        `<div class="line ${data.type}">${data.loading ? `<img class="loading" src="./loading.svg" />` : ''} ${
            data.message
        }</div>`,
    );

    if (!hover) {
        $log.scrollTop = $log.scrollHeight;
    }
}

function mergeBuffer(...buffers) {
    const Cons = buffers[0].constructor;
    return buffers.reduce((pre, val) => {
        const merge = new Cons((pre.byteLength | 0) + (val.byteLength | 0));
        merge.set(pre, 0);
        merge.set(val, pre.byteLength | 0);
        return merge;
    }, new Cons());
}

function download(url, name) {
    const elink = document.createElement('a');
    elink.style.display = 'none';
    elink.href = url;
    elink.download = name;
    document.body.appendChild(elink);
    elink.click();
    document.body.removeChild(elink);
}

function getSize(byteLength) {
    return Math.floor(byteLength / 1024) + 'kb';
}

function getTime(time) {
    return Math.floor(time / 1000) + 's';
}

function ts2sec(message) {
    const ts = message.split('time=')[1].split(' ')[0];
    const [h, m, s] = ts.split(':');
    return parseFloat(h) * 60 * 60 + parseFloat(m) * 60 + parseFloat(s);
}

async function loadWasm() {
    const url = `./ffmpeg/ffmpeg-core.wasm`;
    return new Promise(async (resolve) => {
        const wasmDir = '/ffmpeg';
        const fs = new SimpleFS.FileSystem();
        await fs.mkdir(wasmDir);
        const wasmPath = `${wasmDir}/ffmpeg-core.wasm`;
        const exist = await fs.exists(wasmPath);

        const loadFromUrl = () =>
            fetch(url).then((response) => {
                const length = Number(response.headers.get('content-length'));
                const reader = response.body.getReader();
                let data = new Uint8Array();
                return (async function loop() {
                    return reader.read().then(async ({ done, value }) => {
                        if (done) {
                            const blob = new Blob([data], {
                                type: 'application/wasm',
                            });
                            await fs.writeFile(wasmPath, blob);
                            return resolve(URL.createObjectURL(blob));
                        }
                        const uint8 = new Uint8Array(value);
                        data = mergeBuffer(data, uint8);
                        const ratioNum = data.byteLength / length;
                        log({
                            message: `[${(ratioNum * 100).toFixed(2)}%] - Loading ${url}`,
                            type: 'warn',
                            replace: true,
                            loading: true,
                        });
                        return loop();
                    });
                })();
            });

        if (exist) {
            try {
                const blob = await fs.readFile(wasmPath);
                resolve(URL.createObjectURL(blob));
            } catch (error) {
                loadFromUrl();
            }
        } else {
            loadFromUrl();
        }
    });
}

async function loadFFmpeg() {
    const { createFFmpeg } = FFmpeg;
    const _wasmPath = await loadWasm();
    const ffmpeg = createFFmpeg({
        log: true,
        corePath: `./ffmpeg/ffmpeg-core.js`,
        _wasmPath,
    });
    ffmpeg.setLogger((data) => {
        const isFrame = data.message.startsWith('frame=') || data.message.startsWith('size=');
        const isFetch = data.message.startsWith('fetch');

        const progress = isFrame ? parseFloat((ts2sec(data.message) / duration).toFixed(3)) : 0;
        const message = isFrame ? `[${(progress * 100).toFixed(2)}%] - ${data.message}` : data.message;

        log({
            message: message,
            type: isFrame ? 'warn' : 'info',
            replace: isFrame,
            loading: isFetch,
        });

        if (isFrame) {
            document.title = `[${(progress * 100).toFixed(2)}%] - Video is generating...`;
        } else {
            document.title = 'Generate blank video online';
        }
    });
    ffmpeg.setLogging(false);
    await ffmpeg.load();
    return ffmpeg;
}

function getDuration() {
    const duration = $second.valueAsNumber + ($minute.valueAsNumber || 0) * 60 + ($hour.valueAsNumber || 0) * 3600;
    if (duration <= 0) throw new Error("The duration can't empty");
    if (duration >= 3600 * 10) throw new Error("The duration can't greater than 10 hours");
    return duration;
}

$log.addEventListener('mousemove', function () {
    hover = true;
});

$log.addEventListener('mouseenter', function () {
    hover = true;
});

$log.addEventListener('mouseleave', function () {
    hover = false;
});

$generate.addEventListener('click', async function () {
    try {
        const now = Date.now();
        const { fetchFile } = FFmpeg;
        duration = getDuration();
        const resolution = $resolution.value;
        const poster = $poster.files[0];
        const output = `${Date.now()}.mp4`;

        log({ type: 'warn', message: 'Start loading FFMPEG dependence, please wait...' });
        const ffmpeg = await loadFFmpeg();
        log({ type: 'success', message: 'Load FFMPEG dependence success' });

        if (poster) {
            ffmpeg.FS('writeFile', poster.name, await fetchFile(poster));
            log({ type: 'success', message: `Load poster image: ${poster.name}` });
        }

        const cmd = [];

        if (poster) {
            cmd.push('-loop', '1');
            cmd.push('-i', poster.name);
            cmd.push('-vf', `scale=${resolution.replace('x', ':')}`);
        } else {
            cmd.push('-f', 'lavfi');
            cmd.push('-i', `color=c=black:s=${resolution}`);
        }

        cmd.push('-t', String(duration));
        cmd.push('-c:v', 'libx264');
        cmd.push('-tune', 'stillimage');
        cmd.push('-pix_fmt', 'yuv420p');
        cmd.push(output);
        await ffmpeg.run(...cmd);

        const uint8 = ffmpeg.FS('readFile', output);
        log({ type: 'success', message: `Video size: ${getSize(uint8.byteLength)}` });
        download(URL.createObjectURL(new Blob([uint8])), output);
        log({ type: 'success', message: `Video download: ${getTime(Date.now() - now)}` });
    } catch (error) {
        log({ type: 'error', message: error.message });
        throw error;
    }
});

log(
    window.crossOriginIsolated
        ? {
              type: 'success',
              message: 'Cross Origin Isolated: ON',
          }
        : {
              type: 'error',
              message: 'Cross Origin Isolated: OFF',
          },
);
