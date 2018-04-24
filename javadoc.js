// handler for javadoc and scaladoc
module.exports = function(href, local, externalUrls = []) {
	href = href.replace(/(.*)(serialized-form|index)\.html[\?#]([^\s\\^@^"]*)([^\s\\^"]*)/g, (match, prefix, _, g1, g2) => {
		if (prefix.indexOf('http') == 0) {
			if (externalUrls.some(u => prefix.indexOf(u) != -1)) {
				// transform
			} else {
				// ignore
				return match
			}
		} else {
			if (!local) {
				return match
			}
		}
		const elements = g1.replace(/\.html/, '').split('.')
		const packages = elements.filter(l => l == l.toLowerCase() && l != 'html').join('/')
		const className = elements.filter(l => l != l.toLowerCase() && l != 'html').join('.')
        return prefix + packages + (className != '' ? '/' + className  : '') + '.html' + (g2 || '').replace('@', '#')
    })
    return href
}
