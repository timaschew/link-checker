// handler for javadoc and scaladoc
module.exports = function(href) {
	href = href.replace(/(serialized-form|index)\.html[\?#]([^\s\\^@^"]*)([^\s\\^"]*)/g, (match, _, g1, g2) => {
		const elements = g1.replace(/\.html/, '').split('.')
		const packages = elements.filter(l => l == l.toLowerCase() && l != 'html').join('/')
		const className = elements.filter(l => l != l.toLowerCase() && l != 'html').join('.')
        return packages + (className != '' ? '/' + className  : '') + '.html' + (g2 || '').replace('@', '#')
    })
    return href
}
