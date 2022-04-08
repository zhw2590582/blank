const express = require('express');
const serveStatic = require('serve-static');
const app = express();
const port = 8081;

app.all('*', (_, res, next) => {
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    res.header('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

app.use(serveStatic('docs', { index: ['index.html'] }));
app.listen(port, () => console.log(`The Web listening on port ${port}!`));
