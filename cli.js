#!/usr/bin/env node

const argv = require('yargs')
const linkChecker = require('./link-checker')
const debug = require('debug')('linkchecker')

const options = argv.usage('Usage: $0 [options] path [options]')
    .example('$0 path/to/html/files', 'checks directory with HTMLfiles for broken links and anchors')
    .boolean('allow-hash-href')
    .describe('allow-hash-href', 'If `true`, ignores the `href` `#`')
    .boolean('disable-external')
    .describe('disable-external', 'disable checks remote links')
    .boolean('external-only')
    .describe('external-only', 'check remote links only')
    .array('file-ignore')
    .describe('file-ignore', 'RegExp to ignore files to scan')
    .array('url-ignore')
    .describe('url-ignore', 'RegExp to ignore URLs')
    .array('url-swap')
    .describe('url-swap', 'RegExp for URLs which can be replaced on the fly')
    .boolean('limit-scope')
    .describe('limit-scope', 'forbid to follow URLs which are out of provided path, like ../somewhere')
    .string('javadoc')
    .describe('javadoc', 'Enable special URL transforming which allows to check iframe deeplinks for specific packages for javadoc and scaladoc')
    .array('http-status-ignore')
    .describe('http-status-ignore', 'pass HTTP status code which will be ignore, by default only 2xx are allowed')
    .boolean('json')
    .describe('json', 'print errors as JSON')
    .default('http-redirects', 0)
    .describe('http-redirects', 'Amount of allowed HTTP redirects')
    .default('http-timeout', 5000)
    .describe('http-timeout', 'HTTP timeout in milliseconds')
    .boolean('warn-name-attr')
    .describe('warn-name-attr', 'show warning if name attribute instead of id was used for an anchor')
    .help('h')
    .alias('h', 'help')
    .argv

debug('CLI options', options)

if (options._.length != 1) {
	console.log('You need to pass exactly one path where to check links')
	argv.showHelp()
	process.exit(1)
}

const mainArgument = options._[0]

linkChecker(mainArgument, options, function(err, result) {
	if (err) {
		console.error(err)
		process.exit(1)
	}
	const {errors, warnings, parsedFiles, localLinks, localAnchorLinks, parentLinks, parentAnchorLinks, remoteLinks, remoteAnchorLinks} = result.stats
	if (options.json) {
		console.log(JSON.stringify(result, null, 2))
	} else {
		result.stats.errors.forEach(error => {
			console.error(`${error.reason} from ${error.source} to ${error.target}`)
		})
		result.stats.warnings.forEach(error => {
			console.log(`${error.reason} from ${error.source} to ${error.target}`)
		})
		console.log('')
		console.log(`${parsedFiles} files were scanned in ${mainArgument}`)
		console.log(`${localLinks + localAnchorLinks} local links and ${parentLinks + parentAnchorLinks} parent links and ${remoteLinks} remote links were checked`)
		console.log(`${errors.length} errors and ${warnings.length} warnings`)

	}
   	if (parsedFiles == 0 || result.stats.errors.length > 0) {
   		process.exit(1)
   	}
})

