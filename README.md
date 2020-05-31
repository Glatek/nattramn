# Nattramn

![](https://svgur.com/i/Le2.svg | width=300)

A continuation of [Wext.js](https://github.com/Vufuzi/wext.js) for [Deno](https://deno.land/).

Allows for a simple way of creating universal web applications - partly following the [PRPL pattern](https://web.dev/apply-instant-loading-with-prpl/). Using web components for the client side logic.

## Usage

Import the Nattramn class and provide a config. Run with `--allow-read` and `--allow-net` flags in your server side code.

Include `<script type="module" src="nattramn-client.js"></script>` in your HTML template to be able to use the web component for the router and link.

For each page handler in the router config, a template is used as a stencil and will stamp the output of the handler method into  `<nattramn-router></nattramn-router>`.

Use the `<nattramn-link>` web component for routes you wish to use soft navigation for. The route will be prefetched on hover similar to [instant.page](https://instant.page/).

### Example

```typescript
import Nattramn from 'https://deno.land/x/npm:nattramn/index.ts';

const template = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body>
    <nattramn-router></nattramn-router>
    <script type="module" src="nattramn-client.js"></script>
  </body>
  </html>
`;

const config = {
  server: {
    compression: true,
    serveStatic: 'public',
    minifyHTML: true
  },
  router: {
    pages: [
      {
        route: '/',
        template,
        handler: async () => ({
          body: `
            <h1>Nattramn</h1>
            <h2>Home</h2>
            <p>
              Click link to go further!
              Read <nattramn-link href="/about">about me.</nattramn-link>
            </p>
            `,
          head: '<title>Home - Nattramn</title>'
        })
      },
      {
        route: '/about',
        template,
        handler: async () => ({
          body: `
            <h1>Nattramn</h1>
            <h2>About</h2>
            <p>The Nattramn only occationally shows himself[1] and is said to be ghost of a suicide[2].</p>
            <small>1) This library sends partial content on some requests.</small>
            <small>2) Node.js 🤡.</small>
          `,
          head: '<title>About - Nattramn</title>'
        })
      }
    ]
  }
};

const nattramn = new Nattramn(config);

await nattramn.startServer(5000);
```

## What does Nattramn do.

Express-like functionally with handlers for route, with the big difference that when partial content is requested only the `<body>` content of the next page is fetched and replaces the inner content of `<nattramn-router>`. There is also support for  `<title>` in `<head>`, but not any other tags in head - as they usually do not matter for client side changes.

## Other

Nattramn in currently in production at [podd.app](https://podd.app).
