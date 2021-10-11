const agent = require('superagent')
const debug = require('debug')('linkchecker:fetch')

const BACKOFF_START = 200
const MAX_BACKOFF_COUNT = 10
const RATE_LIMIT_CODE = 429

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = async function fetch (url, method, options, {cache, expiration, strictMethod = true}) {
  debug('fetching', url)

  let backoffInterval = BACKOFF_START
  for (let backoffTry = 1; backoffTry <= MAX_BACKOFF_COUNT + 1; backoffTry++) {
    try {
      if (cache && cache[url] && (!strictMethod || cache[url].method === method) && cache[url].created + expiration > Date.now()) {
        debug('using cached value for', url)
        return Promise.resolve(Object.assign({}, cache[url].payload, {cached: true}))
      }

      const response = await agent[method](url).timeout({ response: options['http-timeout'] }).redirects(options['http-redirects'])

      if (response && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        if (cache && !response.cached) {
          cache[url] = {
            method: response.request.method.toLowerCase(),
            payload: {
              statusCode: response.statusCode,
              text: response.text
            },
            created: Date.now()
          }
        }
      }

      return response
    } catch (e){
      if (e.status !== RATE_LIMIT_CODE || backoffTry === MAX_BACKOFF_COUNT) {
        throw e
      }
    }

    debug('backing off try no. ', backoffTry, ' for url ', url)
    await sleep(backoffInterval)
    backoffInterval = 2*backoffInterval
  }
}
