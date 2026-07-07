import { getBidApiConfig } from './config.js';

function joinUrl(baseUrl, path) {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
}

export async function createBidApiClient(env) {
  const config = getBidApiConfig(env);
  if (!config.configured) return { client: null, config };

  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const options = {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
    };

    if (body instanceof FormData) {
      options.body = body;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(joinUrl(config.baseUrl, path), options);
    const data = await parseResponse(response);
    if (!response.ok) {
      return {
        data: null,
        error: {
          message: data?.message || data?.error || '요청을 처리하지 못했습니다.',
        },
      };
    }
    return { data, error: null };
  }

  return {
    config,
    client: {
      request,
      get: (path) => request(path),
      post: (path, body) => request(path, { method: 'POST', body }),
      put: (path, body) => request(path, { method: 'PUT', body }),
    },
  };
}
