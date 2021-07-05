const fs = require('fs')
const path = require('path')

const walk = require('walk')

function walker(directory, handler, callback) {
    // Will throw an error if the directory does not exist
    if(!fs.lstatSync(directory).isDirectory()){
        throw new Error('Specified path is not directory!')
    }

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
                console.error('error reading a file', err)
                return next()
            }
            handler(relativeFilePath, content)
            next()
        })
    })
    walker.on('errors', (_parent, _nodeStatsArray, next) => {
        console.log('error walking directory', arguments)
        next()
    })
    walker.on('end', callback)
}

module.exports = walker
