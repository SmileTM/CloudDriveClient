export default async function handler(req, res) {
  // Vercel catch-all route: path is an array of segments.
  // e.g. /api/proxy/folder/file -> query.path = ['folder', 'file']
  // e.g. /api/proxy/ -> query.path = undefined or []
  const { path = [] } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path;
  
  // Construct the target Jianguoyun URL
  const targetUrl = `https://dav.jianguoyun.com/dav/${pathStr}`;

  // Set CORS headers explicitly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL, MOVE, COPY, LOCK, UNLOCK');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, Destination, Overwrite, User-Agent, X-Requested-With');

  // Handle Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Filter request headers
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
        // Remove headers that confuse the upstream or are browser-specific
        if (!['host', 'origin', 'referer', 'cookie', 'connection', 'accept-encoding'].includes(key.toLowerCase())) {
            headers[key] = value;
        }
    }
    
    // Force User-Agent to satisfy Jianguoyun
    headers['user-agent'] = 'WebDAVFS/1.0.0 (0.0.0) CloudMgr/1.0.0';

    // Prepare fetch options
    const fetchOptions = {
        method: req.method,
        headers: headers,
        redirect: 'follow'
    };
    
    // Handle body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body) {
             // If Vercel parsed JSON, stringify it back. If it's a string/buffer, pass it.
             fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
    }

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    // Forward status
    res.status(upstreamResponse.status);

    // Forward headers
    upstreamResponse.headers.forEach((val, key) => {
        if (!['content-encoding', 'content-length', 'access-control-allow-origin'].includes(key.toLowerCase())) {
            res.setHeader(key, val);
        }
    });

    // Send response body
    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}
