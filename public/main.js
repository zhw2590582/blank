let hover = false;
const $log = document.querySelector('.log');
const $generate = document.querySelector('.generate');
const $hour = document.querySelector('.hour');
const $minute = document.querySelector('.minute');
const $second = document.querySelector('.second');
const $resolution = document.querySelector('.resolution');
const $audio = document.querySelector('.audio');
const $frame = document.querySelector('.frame');

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
    let ratioNum = 0;
    ffmpeg.setLogger((data) => {
        const isFrame = data.message.startsWith('frame=') || data.message.startsWith('size=');
        const isFetch = data.message.startsWith('fetch');
        const message = isFrame ? `[${(ratioNum * 100).toFixed(2)}%] - ${data.message}` : data.message;

        log({
            message: message,
            type: isFrame ? 'warn' : 'info',
            replace: isFrame,
            loading: isFetch,
        });

        if (isFrame) {
            document.title = `[${(ratioNum * 100).toFixed(2)}%] - Video is generating...`;
        }
    });
    ffmpeg.setProgress(({ ratio }) => {
        ratioNum = ratio;
    });
    ffmpeg.setLogging(false);
    await ffmpeg.load();
    return ffmpeg;
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
        const duration = '';

        log({
            type: 'warn',
            loading: true,
            message: 'Start loading FFMPEG dependence, please wait...',
        });
        const ffmpeg = await loadFFmpeg();
        log({ type: 'success', message: 'Load FFMPEG dependence success' });
        const output = `${Date.now()}.mp4`;

        await ffmpeg.run(
            '-t',
            '60',
            '-f',
            'lavfi',
            '-i',
            'color=c=black:s=640x480',
            '-c:v',
            'libx264',
            '-tune',
            'stillimage',
            '-pix_fmt',
            'yuv420p',
            output,
        );

        // ffmpeg -t 7200 -f lavfi -i color=c=black:s=640x480 -c:v libx264 -tune stillimage -pix_fmt yuv420p output.mp4
        // ffmpeg -f lavfi -i color=c=black:s=640x480 -i audio.ogg -c:v libx264 -tune stillimage -pix_fmt yuv420p -shortest -c:a aac -b:a 128k output-with-audio.mp4
        // ffmpeg -loop 1 -i black.png -i 'input.mp3' -c:v libx264 -tune stillimage -shortest -pix_fmt yuv420p 'output.mp4'
        // ffmpeg -f lavfi -i color=c=black:s=1280x720:r=5 -i audio.mp3 -crf 0 -c:a copy -shortest output.mp4

        const uint8 = ffmpeg.FS('readFile', output);
        download(URL.createObjectURL(new Blob([uint8])), output);
        log({ type: 'success', message: 'Video download done' });
    } catch (error) {
        log({ type: 'error', message: error.message });
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
              message: 'Cross Origin Isolated: OFF, please refresh the page',
          },
);
