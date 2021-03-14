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
		if (!options.forceZeroExitCode) {
			process.exit(1)
		}
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
		const url = target instanceof Error && target.response && target.response.request? target.response.request.url // superagent error
				  : typeof target === "object" && target.request ? target.request.url // superagent response
				  : typeof target === "string" ? target // plain URL
				  : undefined

		if (url === undefined) {
			console.log('unknown error for:', JSON.stringify(target));
			if (!options.forceZeroExitCode) {
				process.exit(1);
			}
			return options;
		}

		const matchingPattern = Array.from(options.overrides.keys()).find(
			pattern => pattern.exec(url)
		)
		if(!matchingPattern) return options

		return {...options, ...options.overrides.get(matchingPattern)}
	}

	walker(directory, function(filePath, fileContent) {
		if (filePath == '') {
			filePath = path.basename(directory)
		}
		fileCounter += 1
		localPages.add(filePath)


		const lines = fileContent.split('\n');
		const lineStarts = [];
		for(let i=0; i<lines.length; i++) {
			if (i===0) {
				lineStarts[i] = 0;
				continue;
			}
			lineStarts[i] = lineStarts[i-1] + 1 + lines[i].length;
		};

		const getLineCol = function(pos) {
			let line = lineStarts.findIndex(function(v) {
				return v > pos;
			}) - 1;
			return [line, pos - lineStarts[line]];
		};

		const $ = cheerio.load(fileContent, {
			xmlMode: true,
			withStartIndices: true
		});

		const links = $('body').find('a')
		links.each(function(i, element) {
			const position = getLineCol(element.startIndex);
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
			if (splitted.length == 2) {
				const url = splitted[0]
				const anchor = splitted[1]
				href = url + '#' + urlencode.decode(anchor)
			}

			const resolvedHref = path.join(path.dirname(filePath), href)
			debug('text content for ' + resolvedHref, $this.html())
 			if (href.indexOf('http://') == 0 || href.indexOf('https://') == 0) {
				if (href.indexOf('#') == -1) {
					remoteLinks.set(href, { filePath, position })
				} else {
					remoteAnchorLinks.set(href, { filePath, position })
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
						localParentLinks.set(resolvedHref, { filePath, position })
					} else {
						localParentAnchorLinks.set(resolvedHref, { filePath, position })
					}
				}
			} else if (href.indexOf('#') != -1) {
				const resolvedAnchorHref = (href.indexOf('#') == 0 ? filePath + href : resolvedHref)
				debug('adding localAnchorLink on page ' + filePath, resolvedAnchorHref)
				localAnchorLinks.set(resolvedAnchorHref, { filePath, position })
			} else {
				debug('adding localLink on page ' + filePath, resolvedHref)
				localLinks.set(resolvedHref, { filePath, position })
			}
		})

		const anchors = $('html').find('[id], [name]')
		anchors.each(function(i, element) {
			const position = getLineCol(element.startIndex);
			const $this = $(this)
			const anchor = $this.attr('id') || $this.attr('name')
			const entry = localAnchors.get(filePath) || new Set()
			entry.add(anchor)
			debug('adding new local anchor on page ' + filePath, anchor)
			localAnchors.set(filePath, entry)
			if (options['warn-name-attr'] && $this.attr('name')) {
				const lineCol = getLineCol(element.startIndex);
				warnings.push({
					line: lineCol[0],
					column: lineCol[1],
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

		localLinks.forEach((details, link) => {
			const sourcePage = details.filePath
			if (localPages.has(link) === false) {
				debug('page not found from', sourcePage, 'to', link)
				errors.push({
					line: details.position[0],
					column: details.position[1],
					type: 'page',
					target: link,
					source: sourcePage,
					reason: 'page not found'
				})
			}
		})

		localAnchorLinks.forEach((details, link) => {
			debug('lookup for', link)
			const sourcePage = details.filePath;
			const anchorCharIndex = link.indexOf('#')
			const page = link.substr(0, anchorCharIndex)
			const anchor = link.substr(anchorCharIndex + 1)
			const resolvedPage = page === '' ? sourcePage : page
			const entry = localAnchors.get(resolvedPage) || new Set()
			if (entry.has(anchor) === false) {
				debug('anchor not found from', sourcePage, 'to', link)
				errors.push({
					line: details.position[0],
					column: details.position[1],
					type: 'anchor',
					target: resolvedPage + '#' + anchor,
					anchor: anchor,
					source: sourcePage,
					reason: 'anchor not found'
				})
			}
		})

		const localParentLinksArray = Array.from(localParentLinks.keys())
		const localParentFilesExist = localParentLinksArray.map(target => {
			fileCounter += 1
			exists =  fs.existsSync(path.resolve(directory, target))
		})
		localParentFilesExist.forEach((exists, index) => {
			const target = localParentLinksArray[index]
			const source = localParentLinks.get(target)
			if (exists === false) {
				errors.push({
					line: source.position[0],
					column: source.position[1],
					type: 'page',
					target: target,
					source: source.filePath,
					reason: 'page not found'
				})
			}
		})

		const localParentAnchorLinksArray = Array.from(localParentAnchorLinks.keys())
		await Promise.all(localParentAnchorLinksArray.map(target => {
			return new Promise((resolve, reject) => {
				// fileCounter += 1 // TODO: count but not the same page several times
				const filePath = target.split('#')[0] // ignore the anchor
				fs.readFile(path.resolve(directory, filePath), 'utf8', resolve)
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
						line: source.position[0],
						column: source.position[1],
						type: 'page',
						target: target,
						source: source.filePath,
						reason: 'page not found'
					})
				}

				if (result == false) {
					errors.push({
						line: source.position[0],
						column: source.position[1],
						type: 'anchor',
						target: target,
						source: source.filePath,
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
						line: source.position[0],
						column: source.position[1],
						type: 'remote-page',
						target: target,
						source: source.filePath,
						reason: 'could not fetch external page: ' + error.toString() + statusCodeText
					})
				}
			})
		}).catch(error => {
			console.log('Error in resolving remoteLinksArray!')
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
							line: source.position[0],
							column: source.position[1],
							type: 'remote-anchor',
							target: target,
							source: source.filePath,
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
						line: source.position[0],
						column: source.position[1],
						type: 'remote-anchor',
						target: target,
						source: source.filePath,
						reason: 'could not fetch external page: ' + error.toString() + statusCodeText
					})
				}
			})
		}).catch(error => {
			console.log('Error in resolving remoteAnchorLinksArray!')
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
