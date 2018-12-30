const checker = require('./link-checker')

module.exports = function(directory, options) {
	return new Promise((resolve, reject) => {
		checker(directory, options, (err, result) => {
			if (err) {
				return reject(err)
			}
			return resolve(result)
		})
	})
}
