## Installation

### NPM
You can install it via npm

```
npm install -g link-checker-with-index-anchor
```

You can also install it without `-g` but then you need to put the binary,
located in `node_modules/.bin/link-checker` to your `$PATH`.

## Usage

```
Usage: cli.js path [options]

Options:
  --version             Show version number                            [boolean]
  --allow-hash-href     If `true`, ignores the `href` `#`              [boolean]
  --disable-external    disable checks remote links                    [boolean]
  --external-only       check remote links only                        [boolean]
  --file-ignore         RegExp to ignore files to scan                   [array]
  --url-ignore          RegExp to ignore URLs                            [array]
  --url-swap            RegExp for URLs which can be replaced on the fly [array]
  --limit-scope         forbid to follow URLs which are out of provided path,
                        like ../somewhere                              [boolean]
  --javadoc             Enable special URL transforming which allows to check
                        iframe deeplinks for local javadoc and scaladoc[boolean]
  --javadoc-external    Domain or base URL to do URL transformation to check
                        iframe deeplinks                                 [array]
  --http-status-ignore  pass HTTP status code which will be ignore, by default
                        only 2xx are allowed                             [array]
  --json                print errors as JSON                           [boolean]
  --http-redirects      Amount of allowed HTTP redirects            [default: 0]
  --http-timeout        HTTP timeout in milliseconds             [default: 5000]
  --warn-name-attr      show warning if name attribute instead of id was used
                        for an anchor                                  [boolean]
  -h, --help            Show help                                      [boolean]

Examples:
  cli.js path/to/html/files  checks directory with HTMLfiles for broken links
                             and anchors
```
