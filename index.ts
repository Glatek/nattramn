import {
  serve,
  extname,
  ServerRequest,
  Server
} from './deps.ts';

const version = 'v0.0.2';

interface PageData {
  head: string;
  body: string;
  headers?: HeadersInit;
};

interface PageHandlerCallback {
  (req: ServerRequest, params: Record<string, string>): Promise<PageData>;
}

interface Page {
  route: string;
  template: string;
  handler: PageHandlerCallback;
}

interface RouterConfig {
  pages: Page[];
}

interface ServerConfig {
  compression: boolean;
  serveStatic?: string;
  minifyHTML: boolean;
}

interface Config {
  server: ServerConfig;
  router: RouterConfig;
}

const MEDIA_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".css": "text/css",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".js": "application/javascript",
  ".jsx": "text/jsx",
  ".gz": "application/gzip",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "mage/svg+xml",
};

function getContentType(path: string): string | undefined {
  return MEDIA_TYPES[extname(path)];
}

const defaultConfig: Config = {
  server: {
    compression: true,
    minifyHTML: true
  },
  router: {
    pages: []
  }
};

/**
 * Function to decide wether or not we include the part
 * of the template before the <nattramn-router> tag or not.
 *
 * If answerWithPartialContent if true, then anything
 * before <nattramn-router> will not be sent in the request.
 */
function generatePreContent (template: string, answerWithPartialContent: boolean) {
  return answerWithPartialContent ?
    null :
    template.indexOf('<nattramn-router>') !== -1 ? template.split('<nattramn-router>')[0] : template;
}

/**
 * Function to decide wether or not we include the part
 * of the template after the <nattramn-router> tag or not.
 *
 * If answerWithPartialContent if true, then anything
 * after </nattramn-router> will not be sent in the request.
 */
function generatePostContent (template: string, answerWithPartialContent: boolean) {
  return answerWithPartialContent ?
    null :
    template.indexOf('</nattramn-router>') !== -1 ? template.split('</nattramn-router>')[1] : template;
}

function reqToURL (req: ServerRequest) {
  const base = req.conn.localAddr.transport === 'tcp' ? req.conn.localAddr.hostname : 'localhost';

  return new URL(req.url, 'http://' + base);
}

function canHandleRoute (req: ServerRequest, route: string) {
  const reqUrl = reqToURL(req).pathname;
  const requestURL = reqUrl.split('/');
  const routeURL = route.split('/');

  const matches = routeURL
    .map((value, index) => {
      if (value.includes(':')) {
        return true;
      }

      return value === requestURL[index];
    })
    .filter(Boolean);

  return matches.length === routeURL.length && matches.length === requestURL.length;
}

function routeParams (req: ServerRequest, route: string) {
  const requestURL = reqToURL(req).pathname.split('/');
  const routeURL = route.split('/');

  return routeURL.reduce((acc, curr, i) => {
    const keyname = curr.includes(':') ? curr.split(':')[1] : undefined;

    if (keyname) {
      return {
        ...acc,
        [keyname]: requestURL[i],
      };
    }

    return acc;
  }, {});
}

async function proxy (req: ServerRequest, page: Page) {
  const partialContent = Boolean(req.headers.get('x-partial-content') || reqToURL(req).searchParams.get('partialContent'));
  const pageData = await page.handler(req, routeParams(req, page.route));
  const responseBody = [];

  if (!pageData) {
    throw new Error('Could not create PageData from handler.');
  }

  const { body, head, headers: pageDataHeaders } = pageData;

  const preContent = generatePreContent(page.template, partialContent);

  const headers = new Headers(pageDataHeaders);

  if (headers.get('Cache-Control') === null) {
    headers.set('Cache-Control', 'public, max-age=3600');
  }

  headers.set('Content-Type', 'text/html');

  /*
    If we don't send preConent we still want to update the title in the header on client side navigations.
    Send new title in X-Header-Updates.
  */
   if (!preContent && head) {
    const match = head.match(/<title>(.+)<\/title>/i);

    if (match) {
      const title = match ? match[1] : '';
      const json = JSON.stringify({ title });
      const base64JSON = btoa(unescape(encodeURIComponent(json)));

      headers.set('X-Header-Updates', base64JSON);
    }
  }

  if (preContent) {
    if (head) {
      const preSplit = preContent.split(/<head>/);

      responseBody.push(preSplit[0]);

      // const headMarkup = '<head>' + (config.server.minifyHTML ? minifyHTML(head) : head);
      const headMarkup = '<head>' + head;

      responseBody.push(headMarkup);
      responseBody.push(preSplit[1]);
    } else {
      await req.respond({ body: preContent });
    }
  }

  // const mainBody = config.server.minifyHTML ? minifyHTML(body) : body;
  const mainBody = body;

  responseBody.push(partialContent ? mainBody : `<nattramn-router>${mainBody}</nattramn-router>`);

  const postContent = generatePostContent(page.template, partialContent);

  if (postContent) {
    await responseBody.push(postContent);
  }

  await req.respond({ headers, body: responseBody.join('\n'), status: 200 });
}

async function serveStatic (req: ServerRequest, filePath: string) {
  filePath = '.' + filePath;

  const [file, fileInfo] = await Promise.all([Deno.open(filePath), Deno.stat(filePath)]);
  const headers = new Headers();

  headers.set('content-length', fileInfo.size.toString());

  const contentType = getContentType(filePath);

  if (contentType) {
    headers.set('content-type', contentType);
  }

  await req.respond({ headers, body: file, status: 200 })

  Deno.close(file.rid);
}

export default class Nattramn {
  config: Config;

  constructor (config: Config = defaultConfig) {
    this.config = {
      ...defaultConfig,
      ...config
    };

    Object.freeze(this.config);
  }

  async handleRequest (req: ServerRequest) {
    const url = reqToURL(req);
    const staticPath = url.pathname.match(this.config.server.serveStatic ?? '');

    const hasExtention = extname(url.pathname) !== "";

    if (hasExtention) {
      if (url.pathname === '/nattramn-client.js') {
        await req.respond({
          body,
          headers: new Headers({
            'Content-Type': 'application/javascript',
            'Location': `https://unpkg.com/nattramn@${version}`
          }),
          status: 302
        });
        return;
      }

      if (staticPath) {
        await serveStatic(req, url.pathname);
        return;
      }

      if (this.config.server.serveStatic) {
        await serveStatic(req, '/' + this.config.server.serveStatic + url.pathname);
        return;
      }

      throw new Error('Could not find file.');
    }

    const page = this.config.router.pages.find(page => canHandleRoute(req, page.route));

    if (page) {
      await proxy(req, page);
    } else {
      throw new Error('Could not find route.');
    }
  }

  async handleRequests (server: Server) {
    for await (const req of server) {
      try {
        await this.handleRequest(req);
      } catch (e) {
        console.debug(`Nattramn was asked to answer for ${req.url} but did not find a suitable way to handle it.`);

        if (extname(req.url) === null) {
          console.debug('The route is missing.');
        }

        if (extname(req.url) !== null) {
          console.debug('The file is missing.');
        }

        console.error(e);
        req.respond({ status: 404, body: 'Not Found' });
      }
    }
  }

  async startServer (port = 5000) {
    // console.log('Using config: ', JSON.stringify(this.config));

    const server = serve({ port });

    console.log('Nattramn is running at: http://localhost:' + port);

    await this.handleRequests(server);
  }
}
