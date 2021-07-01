const agent = require('superagent')
const debug = require('debug')('linkchecker:fetch')

const BACKOFF_START = 200
const MAX_BACKOFF_COUNT = 5
const RATE_LIMIT_CODE = 429

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = async function fetch (url, method, options) {
  debug('fetching', url)

  let backoffInterval = BACKOFF_START
  for (let backoffTry = 1; backoffTry <= MAX_BACKOFF_COUNT + 1; backoffTry++) {
    try {
      return await agent[method](url).timeout({ response: options['http-timeout'] }).redirects(options['http-redirects'])
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
