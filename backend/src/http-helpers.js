// Small helpers that give the raw Node `http` request/response objects a
// slightly more Express-like feel, without pulling in Express.

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // 10MB cap - big enough for a base64-encoded photo/voice note upload
    // (see routes/uploads.js), small enough to stay a reasonable safety cap.
    const MAX_BYTES = 10 * 1024 * 1024;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Geçersiz JSON gövdesi'));
      }
    });
    req.on('error', reject);
  });
}

function enhanceResponse(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(payload) {
    const body = JSON.stringify(payload);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(body);
    return res;
  };
  return res;
}

// Compile a path pattern like "/api/matches/:id/messages" into a matcher.
function compilePattern(pattern) {
  const segments = pattern.split('/').filter(Boolean);
  return (pathSegments) => {
    if (pathSegments.length !== segments.length) return null;
    const params = {};
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const actual = pathSegments[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(actual);
      } else if (seg !== actual) {
        return null;
      }
    }
    return params;
  };
}

module.exports = { readBody, enhanceResponse, compilePattern };
