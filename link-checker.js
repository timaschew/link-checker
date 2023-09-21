const fs = require('fs')
const path = require('path')

const debug = require('debug')('linkchecker')
const cheerio = require('cheerio')
const urlencode = require('urlencode')
const agent = require('superagent')
const mkdirp = require('mkdirp')
const ms = require('ms')
const walker = require('./walker')
const javadoc = require('./javadoc')

var rcConfig = require('rc')('linkchecker', {});

const CACHE_FILE = 'cache-v1.json'

module.exports = function(directory, options = {}, callback) {
    options = {...rcConfig, ...options}

	let cache = null
	const expiration = ms(options.httpCacheMaxAge || '1w')
	if (expiration == null) {
		console.error('Invalid value for --http-cache-max-age')
		process.exit(1)
	}
	if (options.httpCache != null && options.httpCache != '') {
		console.log('Using cache directory', options.httpCache, 'with max age of', expiration, 'seconds')
		mkdirp.sync(options.httpCache)
		try {
			const content = fs.readFileSync(path.join(options.httpCache, CACHE_FILE), 'utf8')
			cache = JSON.parse(content)
		} catch(err) {
			cache = {}
		}
    }
    overridePatterns = new Map(Object.entries(options.overrides || {}))
    options.overrides = new Map()
    overridePatterns.forEach((opts, pattern) => {
        options.overrides.set(new RegExp(pattern), opts)
        options.overrides.delete(pattern)
    })
	
	const localLinks = new Map() // links to other local files, without an anchor
	const localAnchorLinks = new Map() // links to other local files with an anchor
	const localParentLinks = new Map() // 
	const localParentAnchorLinks = new Map()
	const remoteLinks = new Map() // links to remote files, http(s), without an anchor)
	const remoteAnchorLinks = new Map() // links to remote files, http(s) with an anchor
	const localAnchors = new Map() // map which contains all anchors for a local file
	const localPages = new Set() // set of local pages, used to lookup for localLinks
	const warnings = [] // e.g. using name instead of id, or missing alt attribute for img
	const errors = []

	let fileCounter = 0
    debug('scanning directory', directory)
    
    function getOverrideFor(target) {
        const url = target instanceof Error && target.response ? target.response.request.url // superagent error
            : typeof target === "object" ? target.request.url // superagent response
            : typeof target === "string" ? target // plain URL
            : null
              
        const matchingPattern = Array.from(options.overrides.keys()).find(
            pattern => pattern.exec(url)
        )
        
        if(!matchingPattern) return options
        
        const opts = {...options, ...options.overrides.get(matchingPattern)}
        return opts
    }

	walker(directory, function(filePath, fileContent) {
		if (filePath == '') {
			filePath = path.basename(directory)
		}
		fileCounter += 1
		localPages.add(filePath)

		const $ = cheerio.load(fileContent)

		const links = $('body').find('a')
		links.each(function(i, element) {
			const $this = $(this)
            let href = ($this.attr('href') || '').trim()
            const linkSpecificOptions = getOverrideFor(href)
			
			if (href.indexOf('mailto:') == 0) {
				return
			}

			if (href == '#' && linkSpecificOptions['allow-hash-href']) {
				debug('ignore hash href on', filePath)
				return
			}

			if (href == null || href == '') {
				debug('ignore invalid href "' + href + '" on', filePath)
				return
			}

			if (linkSpecificOptions['file-ignore'] && linkSpecificOptions['file-ignore'].length > 0) {
				const found = linkSpecificOptions['file-ignore'].some(ignore => {
					return filePath.match(ignore) != null
				})
				if (found) {
					debug('ignoring file', filePath)
					return
				}
			}	

			if (href == '.') {
				debug('ignore link to itself via . from', filePath)
				return
			}
			if (href.indexOf('javascript:') != -1) {
				debug('ignore javascript href: ' + href, filePath)
				return
			}

			if (linkSpecificOptions['url-swap'] && linkSpecificOptions['url-swap'].length > 0) {
				const found = linkSpecificOptions['url-swap'].forEach(line => {
					// DO NOT use split(':') because it might be replaced with http:// 
					const indexOfColon = line.indexOf(':')
					const pattern = new RegExp(line.substr(0, indexOfColon))
					const replacement = line.substr(indexOfColon + 1)
					if (href.match(pattern)) {
						debug(`replacing ${pattern} with ${replacement} in ${href}`, filePath)
						href = href.replace(pattern, replacement)
						debug('replaced', href)
					}
				})
			}	
			if (linkSpecificOptions['url-ignore'] && linkSpecificOptions['url-ignore'].length > 0) {
				const found = linkSpecificOptions['url-ignore'].some(ignore => {
					return href.match(ignore) != null
				})
				if (found) {
					debug('ignoring URL', href)
					return
				}
			}

			if (href.indexOf('http://') != 0 && href.indexOf('https://') != 0) {
				if (options['external-only']) {
					return
				}
				if (href.split('').pop() == '/') {
					debug('append index.html to ' + href, filePath)
					href = href + 'index.html'
				} else if (href.substr(href.length - 2) == '..') {
					debug('append /index.html to ' + href, filePath)
					href = href + '/index.html'
				} else if (options['mkdocs'] && href.indexOf('/#') >= 0) {
					debug('add index.html between / and # ' + href, filePath)
					href = href.substr(0, href.indexOf('#')) + 'index.html' + href.substr(href.indexOf('#'))
				}
			} else {
				if (options['disable-external']) {
					debug('ignore remote link' + href, filePath)
					return
				}
				
			}
			
			if (options.javadoc || (options['javadoc-external'] && options['javadoc-external'].length > 0)) {
				href = javadoc(href, options.javadoc, options['javadoc-external'])
				// some links have a special href attribute (<a xlink:href="...">)
	 			if ($this[0]['x-attribsPrefix'].href != null) {
	 				// special handler for links inside SVGs which generated by scaladoc
	 				// links with anchors don't work on other page but on the page itself
	 				const [xPage, xHref] = href.split('#')
	 				if (xPage == '') {
	 					// except for anchors to the page itself
	 					href = '#' + xHref
	 				} else {
	 					// ignore other pages
	 					// TOOD: better allow to ignore special anchors,
	 					// in this case 'inheritance-diagram'
	 					return
	 				}
	 			}
 			}

			// decode anchors
			const splitted = href.split('#')
			var resolvedHref
			if (splitted.length == 2) {
				const url = splitted[0]
				const anchor = splitted[1]
				href = url + '#' + urlencode.decode(anchor)
				resolvedHref = path.join(path.dirname(filePath), url) + '#' + urlencode.decode(anchor)
			} else {
				resolvedHref = path.join(path.dirname(filePath), href)
			}

			debug('text content for ' + resolvedHref, $this.html())
 			if (href.indexOf('http://') == 0 || href.indexOf('https://') == 0) {
				if (href.indexOf('#') == -1) {
					remoteLinks.set(href, filePath)
				} else {
					remoteAnchorLinks.set(href, filePath)
				}
			} else if (resolvedHref.indexOf('..') == 0) {
				// non http(s) links
				if (options['limit-scope']) {
					// TODO: same error will reported multiple times, consider to do the check and creating errors in the callback/
					errors.push({
						type: 'out-of-scope',
						target: resolvedHref,
						source: filePath,
						reason: 'target is out of scope'
					})
				} else {
					if (href.indexOf('#') == -1) {
						localParentLinks.set(resolvedHref, filePath)
					} else {
						localParentAnchorLinks.set(resolvedHref, filePath)
					}
				}
			} else if (href.indexOf('#') != -1) {
				const resolvedAnchorHref = (href.indexOf('#') == 0 ? filePath + href : resolvedHref)
				debug('adding localAnchorLink on page ' + filePath, resolvedAnchorHref)
				localAnchorLinks.set(resolvedAnchorHref, filePath) // consider to use a set as value
			} else {
				debug('adding localLink on page ' + filePath, resolvedHref)
				localLinks.set(resolvedHref, filePath) // consider to use a set as value
			}



		})

		const anchors = $('html').find('[id], [name]')
		anchors.each(function(i, element) {
			const $this = $(this)
			const anchor = $this.attr('id') || $this.attr('name')
			const entry = localAnchors.get(filePath) || new Set()
			entry.add(anchor)
			debug('adding new local anchor on page ' + filePath, anchor)
			localAnchors.set(filePath, entry)
			if (options['warn-name-attr'] && $this.attr('name')) {
				warnings.push({
					type: 'anchor',
					content: anchor,
					source: filePath,
					reason: 'name attribute was used instead of id'
				})
			}
		})
		
	}, async function() {
		debug('localPages', localPages)
		debug('remotePages', remoteLinks)
		debug('localLinks', localLinks)
		debug('localAnchorLinks', localAnchorLinks)
		debug('localAnchors', localAnchors)

		localLinks.forEach((sourcePage, link) => {
			if (localPages.has(link) === false) {
				debug('page not found from', sourcePage, 'to', link)
				errors.push({
					type: 'page',
					target: link,
					source: sourcePage,
					reason: 'page not found'
				})
			}
		})

		localAnchorLinks.forEach((sourcePage, link) => {
			debug('lookup for', link)
			const anchorCharIndex = link.indexOf('#') 
			const page = link.substr(0, anchorCharIndex)
			const anchor = link.substr(anchorCharIndex + 1)
			const resolvedPage = page === '' ? sourcePage : page
			const entry = localAnchors.get(resolvedPage) || new Set()
			if (entry.has(anchor) === false) {
				debug('anchor not found from', sourcePage, 'to', link)
				errors.push({
					type: 'anchor',
					target: resolvedPage + '#' + anchor,
					anchor: anchor,
					source: sourcePage,
					reason: 'anchor not found'
				})
			}
		})

		const localParentLinksArray = Array.from(localParentLinks.keys())
		await Promise.all(localParentLinksArray.map(target => {
			return new Promise((resolve, reject) => {
				fileCounter += 1
				fs.exists(path.resolve(directory, target), result => {
					resolve(result)
				})
			})
		}))
		.then(results => {
			results.forEach((result, index) => {
				const target = localParentLinksArray[index]
				const source = localParentLinks.get(target)
				if (result == false) {
					errors.push({
						type: 'page',
						target: target,
						source: source,
						reason: 'page not found'
					})
				}
			})
		})

		const localParentAnchorLinksArray = Array.from(localParentAnchorLinks.keys())
		await Promise.all(localParentAnchorLinksArray.map(target => {
			return new Promise((resolve, reject) => {
				// fileCounter += 1 // TODO: count but not the same page several times
				const filepath = target.split('#')[0] // ignore the anchor
				fs.readFile(path.resolve(directory, filepath), 'utf8', resolve)
			})
		})
		// map rejected to resolved promises
		.map(p => p.catch(error => {error: error})))
		.then(results => {
			results.forEach((result, index) => {
				const target = localParentAnchorLinksArray[index]
				const source = localParentAnchorLinks.get(target)
				if (result instanceof Error) {
					return errors.push({
						type: 'page',
						target: target,
						source: source,
						reason: 'page not found'
					})
				}

				if (result == false) {
					errors.push({
						type: 'anchor',
						target: target,
						source: source,
						reason: 'anchor not found'
					})
				}
			})
        })

		const remoteLinksArray = Array.from(remoteLinks.keys())
		await Promise.all(remoteLinksArray.map(target => {
            const linkSpecificOptions = getOverrideFor(target)
			let method = 'head'
			if (linkSpecificOptions['http-always-get']) {
				method = 'get'
			}
			if (cache && cache[target] && cache[target].created + expiration > Date.now()) {
				return new Promise(resolve => resolve(Object.assign({}, cache[target].payload, {cached: true})))
			}
			return agent[method](target).timeout({response: linkSpecificOptions['http-timeout']}).redirects(linkSpecificOptions['http-redirects'])
		})
		// map rejected to resolved promises
		.map(p => p.catch(error => error)))
		.then(responses => {
			responses.forEach((response, index) => {
                const linkSpecificOptions = getOverrideFor(response)
				if (response && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
					// ok
					const target = remoteLinksArray[index]
					if (cache && !response.cached) {
						cache[target] = {
							payload: {
								statusCode: response.statusCode
							},
							created: Date.now()
						}
					}
				} else {
					const error = response
					const statusCode = response.statusCode || error.response && error.response.statusCode
					const target = remoteLinksArray[index]
					const source = remoteLinks.get(target)

					if (statusCode && linkSpecificOptions['http-status-ignore'] && linkSpecificOptions['http-status-ignore'].length > 0) {
						const found = linkSpecificOptions['http-status-ignore'].some(code => code == statusCode)
						if (found) {
							debug('ignore status code ' + statusCode, target)
							return
						}
					}
					let statusCodeText = ''
					if (statusCode != null) {
						statusCodeText = ` (Code: ${statusCode})`
					}
					errors.push({
						type: 'remote-page',
						target: target,
						source: source,
						reason: 'could not fetch external page: ' + error.toString() + statusCodeText
					})
				}
			})
		}).catch(error => {
			console.log('WTF, this should not happen')
			console.error(error)
		})

		const remoteAnchorLinksArray = Array.from(remoteAnchorLinks.keys())
		await Promise.all(remoteAnchorLinksArray.map(target => {
            const linkSpecificOptions = getOverrideFor(target)
			if (cache && cache[target] && cache[target].created + expiration > Date.now()) {
				return new Promise(resolve => resolve(Object.assign({}, cache[target].payload, {cached: true})))
                        }
			return agent.get(target).timeout({response: linkSpecificOptions['http-timeout']}).redirects(linkSpecificOptions['http-redirects'])
		})
		// map rejected to resolved promises
		.map(p => p.catch(error => error)))
		.then(responses => {
			responses.forEach((response, index) => {
                if(!response.request && !response.response.request) {
                    console.error(response)
                }
                const linkSpecificOptions = getOverrideFor(response)
				const target = remoteAnchorLinksArray[index]
				const source = remoteAnchorLinks.get(target)

				if (response && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
					if (cache && !response.cached) {
						cache[target] = {
        	                                        payload: {
                	                                        statusCode: response.statusCode,
								text: response.text 
                                	                },
                                        	        created: Date.now()
                                        	}
                    }
                    if(!linkSpecificOptions['allow-hash-ref']) return
					const anchor = target.split('#')[1]
					const $ = cheerio.load(response.text)
					const anchors = $('body').find(`[id='${anchor}'], [name='${anchor}']`)
					if (anchors.length == 0) {
						errors.push({
							type: 'remote-anchor',
							target: target,
							source: source,
							reason: 'page was found but not the anchor'
						})
					}

				} else {
					const error = response
					const statusCode = response.statusCode || error.response && error.response.statusCode

					if (statusCode && linkSpecificOptions['http-status-ignore'] && linkSpecificOptions['http-status-ignore'].length > 0) {
						const found = linkSpecificOptions['http-status-ignore'].some(code => code == statusCode)
						if (found) {
							debug('ignore status code ' + statusCode, target)
							return
						}
					}
					let statusCodeText = ''
					if (statusCode != null) {
						statusCodeText = ` (Code: ${statusCode})`
					}
					errors.push({
						type: 'remote-anchor',
						target: target,
						source: source,
						reason: 'could not fetch external page: ' + error.toString() + statusCodeText
					})
				}
			})
		}).catch(error => {
			console.log('WTF, this should not happen')
			console.error(error)
		})

		debug('fileCounter', fileCounter)
		if (cache) {
			fs.writeFileSync(path.join(options.httpCache, CACHE_FILE), JSON.stringify(cache, null, 2), 'utf8')
		}
		callback(null, {
			stats: {
				errors: errors,
				warnings: warnings,
				parsedFiles: fileCounter,
				localLinks: localLinks.size,
				localAnchorLinks: localAnchorLinks.size,
				parentLinks: localParentLinks.size,
				parentAnchorLinks: localParentAnchorLinks.size,
				remoteLinks: remoteLinks.size,
				remoteAnchorLinks: remoteAnchorLinks.size
			}
		})
	})
}

