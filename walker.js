const fs = require('fs')
const path = require('path')

const walk = require('walk')

function walker(directory, handler, callback) {
    const walker = walk.walk(directory)
    walker.on('file', function (parent, fileStats, next) {
        const filePath = path.resolve(parent, fileStats.name)
        const relative = path.relative(filePath, directory)
        const base = path.resolve(filePath, relative)
        const relativeFilePath = filePath.substr(base.length + 1)
        if (path.extname(fileStats.name) != '.html') {
            handler(relativeFilePath, '')
            return next()
        }
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                console.error(err)
                return next()
            }
            handler(relativeFilePath, content)
            next()
        })
    })
    walker.on('errors', (_parent, _nodeStatsArray, next) => {
        console.log('error', arguments)
        next()
    })
    walker.on('end', callback)
}

module.exports = walker
