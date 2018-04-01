const fs = require('fs')
const path = require('path')

const walk = require('walk')

function walker(directory, handler, callback) {
    const walker = walk.walk(directory)
    walker.on('file', function (parent, fileStats, next) {
        if (path.extname(fileStats.name) != '.html') {
            return next()
        }
        const filePath = path.resolve(parent, fileStats.name)
        fs.readFile(filePath, 'utf8', function (err, content) {
            if (err) {
                console.error(err)
                return next()
            }
            const relative = path.relative(filePath, directory)
            const base = path.resolve(filePath, relative)
            const relativeFilePath = filePath.substr(base.length + 1)
            handler(relativeFilePath, content)
            next()
        })
    })
    walker.on('errors', function (parent, nodeStatsArray, next) {
        console.log('error', arguments)
        next()
    })
    walker.on('end', function () {
        callback()
    })
}

module.exports = walker
